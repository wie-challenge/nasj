import { FixedDevice } from './fixtures.js';
import { BUILD, LocalWearable } from './simulator.js';
const pulses: number[] = [];
const model = new LocalWearable({
  pulse: (duration) => {
    pulses.push(duration);
  },
  stop: () => {},
});
for (const sample of new FixedDevice().samples()) model.sample(sample);
console.log(
  JSON.stringify(
    {
      build: BUILD,
      provenance: 'SIMULATED',
      physicalDevice: false,
      clock: 'accelerated fixture milliseconds',
      simulatedPulsesMs: pulses,
      summary: model.summary(),
    },
    null,
    2,
  ),
);
