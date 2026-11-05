"""Build a review video from actual disposable-showroom screenshots and local TTS.
Requires ffmpeg, ffprobe, espeak. This is a narrated capture montage, not a continuous recording.
"""
from pathlib import Path
import subprocess, re, json, hashlib
root=Path(__file__).resolve().parent.parent
work=root/'.local/batch7/video';work.mkdir(parents=True,exist_ok=True)
capture=root/'.local/batch7/capture'
source=(root/'docs/competition/PHASE1_VIDEO_STORYBOARD.md').read_text()
narrations=re.findall(r'Narration: [“"](.*?)[”"]',source)
assert len(narrations)==7
slots=[20,25,30,30,30,25,20]
images=['01-showroom.png','01-showroom.png','03-artisan-accepted.png','05-quality-approved.png','07-public-traceability.png','08-finance-payable.png','01-showroom.png']
titles=['Problem hypothesis','Implemented architecture','Voluntary artisan decision','Production and quality','Privacy-safe traceability','Obligations remain distinct','Progress and next validation']
records=[]
def run(args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
def clock(t):return f'{int(t//3600):02}:{int(t//60)%60:02}:{t%60:06.3f}'.replace('.',',')
for i,(text,seconds,picture,title) in enumerate(zip(narrations,slots,images,titles),1):
 wav=work/f'{i}.wav';run(['espeak','-v','en','-s','175','-w',str(wav),text])
 duration=float(subprocess.check_output(['ffprobe','-v','quiet','-show_entries','format=duration','-of','csv=p=0',str(wav)]))
 assert duration<=seconds, (i,duration,seconds)
 sentences=re.split(r'(?<=[.!?])\s+',text);total=sum(len(s.split()) for s in sentences);cursor=0;subs=[]
 for n,sentence in enumerate(sentences,1):
  end=cursor+duration*len(sentence.split())/total
  subs.append(f'{n}\n{clock(cursor)} --> {clock(end)}\n{sentence}\n');cursor=end
 srt=work/f'{i}.srt';srt.write_text('\n'.join(subs))
 label=work/f'{i}.txt';label.write_text(f'SYNTHETIC SOFTWARE DEMONSTRATION  |  {title}  |  REVIEW CANDIDATE')
 vf=f"scale=1080:608:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:30:color=0x10251f,drawtext=textfile='{label}':fontcolor=white:fontsize=15:x=(w-tw)/2:y=6:box=1:boxcolor=0x10251f@1,subtitles='{srt}':force_style='Fontsize=11,PrimaryColour=&HFFFFFF,OutlineColour=&H10251F,BorderStyle=3,Outline=2,MarginV=8'"
 clip=work/f'{i}.mp4'
 run(['ffmpeg','-y','-loop','1','-framerate','15','-i',str(capture/picture),'-i',str(wav),'-vf',vf,'-af',f'apad=whole_dur={seconds}','-t',str(seconds),'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-map_metadata','-1',str(clip)])
 records.append({'scene':i,'seconds':seconds,'speechSeconds':duration,'capture':picture,'captureSha256':hashlib.sha256((capture/picture).read_bytes()).hexdigest(),'narration':text})
concat=work/'concat.txt';concat.write_text('\n'.join(f"file '{work/f'{i}.mp4'}'" for i in range(1,8)))
output=root/'output/video/PHASE1_PROGRESS_REVIEW.mp4';output.parent.mkdir(parents=True,exist_ok=True)
run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(concat),'-c','copy','-map_metadata','-1','-movflags','+faststart',str(output)])
(root/'docs/engineering/evidence/batch7-20261027/video-build.json').write_text(json.dumps({'output':str(output.relative_to(root)),'method':'Actual browser screenshot montage, local espeak narration and burned captions; not continuous recording','scenes':records,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()},indent=2)+'\n')
print(output)
