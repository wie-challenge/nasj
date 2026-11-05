export type OfferLanguage = 'en' | 'fr' | 'ar';
export function offerLanguage(value: unknown): OfferLanguage {
  return value === 'fr' || value === 'ar' ? value : 'en';
}
export function offerDirection(value: OfferLanguage) {
  return value === 'ar' ? 'rtl' : 'ltr';
}
const en = {
  method: 'Compensation method',
  language: 'Offer language',
  quantity: 'Quantity (pieces)',
  effort: 'Estimated effort (hours)',
  rate: 'Agreed unit pay',
  total: 'Total agreed pay',
  specification: 'Craft specification',
  materials: 'Material responsibility',
  rework: 'Quality/rework terms',
  payment: 'Payment conditions',
  collection: 'Collection',
  instructions: 'Instructions',
  expires: 'Offer expires',
  deadline: 'Delivery deadline',
  accept: 'Accept this offer voluntarily',
  decline: 'Decline offer without penalty',
  question: 'Clarification question',
  clarify: 'Request clarification',
  sent: 'Clarification request recorded. This does not accept the offer.',
  error: 'Unable to complete the action. Your draft is preserved; retry or request help.',
  warning:
    'Declining an offer or refusing a wearable carries no eligibility penalty. This is synthetic; no payment is recorded by this decision.',
  translation:
    'A reviewed translation is not available. French and Arabic interface copy is unreviewed. Commercial text remains in its original English. Select English and acknowledge understanding before acceptance; otherwise request clarification.',
  acknowledge:
    'I understand and have reviewed the original English terms for this exact offer version.',
  busy: 'Working…',
  restricted: 'Restricted',
  status: 'Offer status',
};
type Copy = Record<keyof typeof en, string>;
// Draft interface copy only. Qualified commercial translation approval remains an external gate.
export const offerCopy: Record<OfferLanguage, Copy> = {
  en,
  fr: {
    method: 'Mode de rémunération',
    language: 'Langue de l’offre',
    quantity: 'Quantité',
    effort: 'Effort estimé',
    rate: 'Prix unitaire convenu',
    total: 'Rémunération totale convenue',
    specification: 'Spécification du produit',
    materials: 'Responsabilité des matériaux',
    rework: 'Qualité et retouches',
    payment: 'Conditions de paiement',
    collection: 'Collecte',
    instructions: 'Instructions',
    expires: 'Expiration de l’offre',
    deadline: 'Date limite de livraison',
    accept: 'Accepter volontairement cette offre',
    decline: 'Refuser sans pénalité',
    question: 'Question de clarification',
    clarify: 'Demander une clarification',
    sent: 'Demande enregistrée. Cela ne constitue pas une acceptation.',
    error: 'Action impossible. Votre brouillon est conservé ; réessayez ou demandez de l’aide.',
    warning:
      'Refuser une offre ou un dispositif porté ne réduit pas votre admissibilité. Simulation : cette décision ne constitue pas un paiement.',
    translation:
      'Aucune traduction commerciale approuvée n’est disponible. Les textes d’interface français et arabes ne sont pas validés. Les conditions restent en anglais. Sélectionnez l’anglais et confirmez votre compréhension avant d’accepter, ou demandez une clarification.',
    acknowledge:
      'Je comprends et j’ai examiné les conditions originales en anglais de cette version exacte de l’offre.',
    busy: 'Traitement…',
    restricted: 'Accès restreint',
    status: 'État de l’offre',
  },
  ar: {
    method: 'طريقة الأجر',
    language: 'لغة العرض',
    quantity: 'الكمية',
    effort: 'الجهد التقديري',
    rate: 'الأجر المتفق عليه للوحدة',
    total: 'إجمالي الأجر المتفق عليه',
    specification: 'مواصفات المنتج',
    materials: 'مسؤولية المواد',
    rework: 'الجودة وإعادة العمل',
    payment: 'شروط الدفع',
    collection: 'الاستلام',
    instructions: 'التعليمات',
    expires: 'انتهاء صلاحية العرض',
    deadline: 'موعد التسليم',
    accept: 'قبول هذا العرض طوعا',
    decline: 'الرفض دون عقوبة',
    question: 'سؤال للتوضيح',
    clarify: 'طلب توضيح',
    sent: 'تم تسجيل طلب التوضيح. هذا لا يعني قبول العرض.',
    error: 'تعذر إتمام الإجراء. تم حفظ المسودة؛ حاول مجددا أو اطلب المساعدة.',
    warning:
      'رفض العرض أو الجهاز القابل للارتداء لا يؤثر على أهليتك. هذه محاكاة ولا يمثل هذا القرار دفعا ماليا.',
    translation:
      'لا تتوفر ترجمة تجارية معتمدة. نصوص الواجهة الفرنسية والعربية غير مراجعة. تبقى الشروط باللغة الإنجليزية الأصلية. اختر الإنجليزية وأكد فهمك قبل القبول، أو اطلب توضيحا.',
    acknowledge: 'أفهم وقد راجعت الشروط الإنجليزية الأصلية لهذه النسخة المحددة من العرض.',
    busy: 'جار التنفيذ…',
    restricted: 'وصول مقيد',
    status: 'حالة العرض',
  },
};
