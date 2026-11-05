// Scripted answers for the front-end preview. Replace with the streaming hook once the NestJS
// assistant module exists (see ai-backend/docs/nasouj-tasks.md, B1 and B2).

export type NasoujRole =
  | 'welcome'
  | 'buyer'
  | 'association'
  | 'operator'
  | 'coordinator'
  | 'finance';
export type NasoujLocale = 'en' | 'fr' | 'ar';

type Localized = Record<NasoujLocale, string>;
export type NasoujTopic = { question: Localized; answer: Localized; keywords: string[] };

export const nasoujCopy = {
  greeting: {
    en: 'Hello, I am Nasouj! How can I help you today?',
    fr: 'Bonjour, je suis Nasouj ! Comment puis-je vous aider ?',
    ar: 'مرحبا، أنا نسوج! كيف يمكنني مساعدتك اليوم؟',
  },
  placeholder: {
    en: 'Ask Nasouj a question',
    fr: 'Posez votre question à Nasouj',
    ar: 'اطرح سؤالك على نسوج',
  },
  send: { en: 'Send', fr: 'Envoyer', ar: 'إرسال' },
  fallback: {
    en: 'I am in preview, so I can only answer the suggested questions for now.',
    fr: 'Je suis en aperçu : pour l’instant, je réponds seulement aux questions suggérées.',
    ar: 'أنا في مرحلة المعاينة، لذلك أجيب الآن عن الأسئلة المقترحة فقط.',
  },
  preview: { en: 'Preview', fr: 'Aperçu', ar: 'معاينة' },
  close: { en: 'Close Nasouj', fr: 'Fermer Nasouj', ar: 'إغلاق نسوج' },
} satisfies Record<string, Localized>;

export const nasoujTopics: Record<NasoujRole, NasoujTopic[]> = {
  welcome: [
    {
      keywords: ['start', 'create', 'join', 'commencer', 'créer', 'بدء', 'إنشاء'],
      question: {
        en: 'How do I get started?',
        fr: 'Comment commencer ?',
        ar: 'كيف أبدأ؟',
      },
      answer: {
        en: 'Choose whether you are creating a company or an association, fill in the short form and add your proof. Our team reviews it and emails you a welcome.',
        fr: 'Choisissez de créer une entreprise ou une association, remplissez le court formulaire et ajoutez votre justificatif. Notre équipe l’étudie et vous envoie un e-mail de bienvenue.',
        ar: 'اختر إنشاء شركة أو جمعية، واملأ النموذج القصير وأضف إثباتك. يراجعه فريقنا ويرسل إليك رسالة ترحيب.',
      },
    },
    {
      keywords: ['proof', 'document', 'pdf', 'justificatif', 'إثبات', 'وثيقة'],
      question: {
        en: 'What counts as proof?',
        fr: 'Quel justificatif fournir ?',
        ar: 'ما الذي يعد إثباتا؟',
      },
      answer: {
        en: 'A PDF showing that you can act for your organization, like an authorization letter or a registration document with your name.',
        fr: 'Un PDF montrant que vous pouvez agir pour votre organisation, comme une lettre d’autorisation ou un document d’enregistrement à votre nom.',
        ar: 'ملف PDF يبين أنه يمكنك التصرف باسم مؤسستك، مثل رسالة تفويض أو وثيقة تسجيل تحمل اسمك.',
      },
    },
  ],
  buyer: [
    {
      keywords: ['order', 'buy', 'cart', 'commande', 'panier', 'طلب', 'سلة'],
      question: {
        en: 'How do I place an order?',
        fr: 'Comment passer une commande ?',
        ar: 'كيف أقدم طلبا؟',
      },
      answer: {
        en: 'Add products from the Catalog to your cart, check your billing and delivery details, then send your request. You can download a pro forma invoice first.',
        fr: 'Ajoutez des produits du Catalogue à votre panier, vérifiez vos informations de facturation et de livraison, puis envoyez votre demande. Vous pouvez d’abord télécharger une facture pro forma.',
        ar: 'أضف المنتجات من الكتالوج إلى سلتك، وتحقق من بيانات الفوترة والتسليم، ثم أرسل طلبك. يمكنك أولا تنزيل فاتورة مبدئية.',
      },
    },
    {
      keywords: ['custom', 'special', 'logo', 'personnalisé', 'مخصص'],
      question: {
        en: 'Can I ask for something custom?',
        fr: 'Puis-je demander un produit sur mesure ?',
        ar: 'هل يمكنني طلب منتج مخصص؟',
      },
      answer: {
        en: 'Yes. Open Custom request, add a photo and a description, and NASJ sends you a price. Work only starts once you accept it.',
        fr: 'Oui. Ouvrez Demande personnalisée, ajoutez une photo et une description, et NASJ vous envoie un prix. Le travail commence seulement après votre accord.',
        ar: 'نعم. افتح الطلب المخصص وأضف صورة ووصفا، وسترسل إليك نسج سعرا. لا يبدأ العمل إلا بعد موافقتك.',
      },
    },
    {
      keywords: ['track', 'status', 'cancel', 'suivre', 'annuler', 'تتبع', 'إلغاء'],
      question: {
        en: 'How do I track or cancel an order?',
        fr: 'Comment suivre ou annuler une commande ?',
        ar: 'كيف أتابع طلبا أو ألغيه؟',
      },
      answer: {
        en: 'Open it in Your orders to follow each step and see who is delivering it. You can cancel with the red button until the order is approved.',
        fr: 'Ouvrez-la dans Vos commandes pour suivre chaque étape et voir qui la livre. Vous pouvez l’annuler avec le bouton rouge jusqu’à son approbation.',
        ar: 'افتحه في طلباتك لمتابعة كل خطوة ومعرفة من يسلمه. يمكنك إلغاؤه بالزر الأحمر إلى أن تتم الموافقة عليه.',
      },
    },
  ],
  association: [
    {
      keywords: ['request', 'accept', 'demande', 'accepter', 'طلب', 'قبول'],
      question: {
        en: 'What do I do with a new request?',
        fr: 'Que faire d’une nouvelle demande ?',
        ar: 'ماذا أفعل بطلب جديد؟',
      },
      answer: {
        en: 'Open it in Requests and choose Accept or Decline. After you accept, assign the artisanes who agreed to the work and set an estimated finish date.',
        fr: 'Ouvrez-la dans Demandes et choisissez Accepter ou Refuser. Ensuite, désignez les artisanes qui ont accepté le travail et indiquez une date de fin estimée.',
        ar: 'افتحه في الطلبات واختر قبول أو رفض. بعد القبول، عيّن الحرفيات اللواتي وافقن على العمل وحدد تاريخ الانتهاء المتوقع.',
      },
    },
    {
      keywords: ['product', 'sheet', 'excel', 'produit', 'منتج'],
      question: {
        en: 'How do I add my products?',
        fr: 'Comment ajouter mes produits ?',
        ar: 'كيف أضيف منتجاتي؟',
      },
      answer: {
        en: 'In Your products, use Add product for one item or Upload a sheet for many. NASJ finance checks each price and the pay before it reaches the catalog.',
        fr: 'Dans Vos produits, utilisez Ajouter un produit pour un article ou Importer un fichier pour plusieurs. La finance de NASJ vérifie chaque prix et la rémunération avant la publication.',
        ar: 'في منتجاتك، استخدم إضافة منتج لعنصر واحد أو رفع ملف لعدة عناصر. تتحقق مالية نسج من كل سعر ومن الأجر قبل ظهوره في الكتالوج.',
      },
    },
    {
      keywords: ['pay', 'payment', 'proof', 'paiement', 'أجر', 'دفع'],
      question: {
        en: 'How do I record an artisane’s payment?',
        fr: 'Comment enregistrer le paiement d’une artisane ?',
        ar: 'كيف أسجل دفع أجر حرفية؟',
      },
      answer: {
        en: 'Open the order, find her under Artisanes on this order, choose Record payment and add your proof. NASJ finance then checks it.',
        fr: 'Ouvrez la commande, trouvez-la dans la liste des artisanes, choisissez Enregistrer le paiement et ajoutez votre justificatif. La finance de NASJ le vérifie ensuite.',
        ar: 'افتح الطلب، وابحث عنها في قائمة الحرفيات، واختر تسجيل الدفع وأضف الإثبات. ثم تتحقق منه مالية نسج.',
      },
    },
  ],
  operator: [
    {
      keywords: ['review', 'accept', 'proof', 'vérifier', 'مراجعة', 'قبول'],
      question: {
        en: 'How do I review an application?',
        fr: 'Comment étudier une candidature ?',
        ar: 'كيف أراجع طلب انضمام؟',
      },
      answer: {
        en: 'Open Companies and associations, read the proof PDF, then choose Review. Accepted organizations get a welcome email automatically.',
        fr: 'Ouvrez Entreprises et associations, lisez le PDF justificatif, puis choisissez Examiner. Les organisations acceptées reçoivent automatiquement un e-mail de bienvenue.',
        ar: 'افتح الشركات والجمعيات، واقرأ ملف الإثبات، ثم اختر مراجعة. تتلقى المؤسسات المقبولة رسالة ترحيب تلقائيا.',
      },
    },
  ],
  coordinator: [
    {
      keywords: ['request', 'send', 'association', 'demande', 'envoyer', 'طلب', 'جمعية'],
      question: {
        en: 'How do I handle a new request?',
        fr: 'Comment traiter une nouvelle demande ?',
        ar: 'كيف أعالج طلبا جديدا؟',
      },
      answer: {
        en: 'Open it in Requests and send it to an association. Catalog orders already suggest the right one, and you can see each association’s crafts and rating.',
        fr: 'Ouvrez-la dans Demandes et envoyez-la à une association. Les commandes du catalogue suggèrent déjà la bonne, et vous voyez les métiers et la note de chacune.',
        ar: 'افتحه في الطلبات وأرسله إلى جمعية. تقترح طلبات الكتالوج الجمعية المناسبة، ويمكنك رؤية حرف كل جمعية وتقييمها.',
      },
    },
    {
      keywords: ['quality', 'ship', 'qr', 'qualité', 'expédier', 'جودة', 'شحن'],
      question: {
        en: 'What happens when a package reaches NASJ?',
        fr: 'Que se passe-t-il quand un colis arrive chez NASJ ?',
        ar: 'ماذا يحدث عند وصول طرد إلى نسج؟',
      },
      answer: {
        en: 'Mark it as received and check its quality. If it passes, add the delivery details to create its QR code and ship it to the company.',
        fr: 'Marquez-le comme reçu et vérifiez sa qualité. S’il est conforme, ajoutez les informations de livraison pour créer son code QR et l’expédier à l’entreprise.',
        ar: 'سجل استلامه وافحص جودته. إذا اجتاز الفحص، أضف بيانات التسليم لإنشاء رمز QR وشحنه إلى الشركة.',
      },
    },
  ],
  finance: [
    {
      keywords: ['price', 'fair', 'pay', 'prix', 'سعر', 'أجر'],
      question: {
        en: 'How do I check a price?',
        fr: 'Comment vérifier un prix ?',
        ar: 'كيف أتحقق من سعر؟',
      },
      answer: {
        en: 'Open Prices and invoices. Each product shows its price, the artisanes’ pay and their share, with a flag when the share is below the minimum.',
        fr: 'Ouvrez Prix et factures. Chaque produit affiche son prix, la rémunération des artisanes et leur part, avec une alerte si cette part est sous le minimum.',
        ar: 'افتح الأسعار والفواتير. يعرض كل منتج سعره وأجر الحرفيات وحصتهن، مع تنبيه إذا كانت الحصة أقل من الحد الأدنى.',
      },
    },
    {
      keywords: ['invoice', 'payment', 'facture', 'paiement', 'فاتورة', 'دفع'],
      question: {
        en: 'What about invoices and payments?',
        fr: 'Et les factures et les paiements ?',
        ar: 'ماذا عن الفواتير والمدفوعات؟',
      },
      answer: {
        en: 'Use the other tabs to check each invoice and to open the proof of each artisane’s payment. Customer payments are not collected yet.',
        fr: 'Utilisez les autres onglets pour vérifier chaque facture et ouvrir le justificatif de paiement de chaque artisane. Les paiements des clients ne sont pas encore encaissés.',
        ar: 'استخدم علامات التبويب الأخرى للتحقق من كل فاتورة وفتح إثبات دفع أجر كل حرفية. لا يتم تحصيل مدفوعات العملاء بعد.',
      },
    },
  ],
};

export function nasoujReply(role: NasoujRole, locale: NasoujLocale, message: string) {
  const text = message.trim().toLowerCase();
  const topic = nasoujTopics[role].find(
    (item) =>
      item.question[locale].toLowerCase() === text ||
      item.keywords.some((keyword) => text.includes(keyword)),
  );
  return topic ? topic.answer[locale] : nasoujCopy.fallback[locale];
}
