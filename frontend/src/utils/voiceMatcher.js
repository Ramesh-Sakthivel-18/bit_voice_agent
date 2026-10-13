/**
 * Voice Command Intent Matcher
 * Provides lenient, substring, regex, and fuzzy intent matching across all Indian languages and English.
 */

// Normalizes transcript: lowercase, trim, remove punctuation, collapse whitespace
export const normalizeText = (text) => {
    if (!text || typeof text !== 'string') return '';
    return text
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Calculates Levenshtein distance between two strings
 */
export const levenshteinDistance = (a, b) => {
    if (!a || !b) return (a || b).length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                );
            }
        }
    }
    return matrix[b.length][a.length];
};

/**
 * Calculates normalized similarity (0 to 1) between two strings
 */
export const similarityRatio = (str1, str2) => {
    const s1 = normalizeText(str1);
    const s2 = normalizeText(str2);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1;
    const dist = levenshteinDistance(s1, s2);
    return 1 - dist / maxLen;
};

/**
 * Checks if transcript matches any keyword via:
 * 1. Substring inclusion (`cleanTranscript.includes(cleanKeyword)`)
 * 2. Word token inclusion (`words.some(...)`)
 * 3. Partial root match (if keyword is longer than 3 chars)
 * 4. Fuzzy similarity threshold (>= 0.75) for near-miss words
 */
export const matchesAnyKeyword = (transcript, keywords = [], threshold = 0.75) => {
    const norm = normalizeText(transcript);
    if (!norm) return false;

    const words = norm.split(' ');

    for (const kw of keywords) {
        const normKw = normalizeText(kw);
        if (!normKw) continue;

        // 1. Exact or substring match
        if (norm.includes(normKw)) return true;

        // 2. Individual word exact or substring match
        for (const w of words) {
            if (w.includes(normKw) || (normKw.length >= 3 && normKw.includes(w) && w.length >= 3)) {
                return true;
            }

            // 3. Fuzzy match for near-miss words (misspellings or slight ASR variance)
            if (w.length >= 3 && normKw.length >= 3) {
                if (similarityRatio(w, normKw) >= threshold) {
                    return true;
                }
            }
        }
    }

    return false;
};

// ─── BUYER FLOW KEYWORDS ───

// Search / Find: 'தேடு', 'வாங்கு', 'பொருள்', 'search', 'buy', 'find', 'மஞ்சள்', 'தேன்', 'turmeric', 'honey'
export const BUYER_SEARCH_KEYWORDS = [
    'தேடு', 'வாங்கு', 'பொருள்', 'search', 'buy', 'find', 'மஞ்சள்', 'தேன்', 'turmeric', 'honey',
    'பொருட்கள்', 'look', 'dhoond', 'khoj', 'forest honey', 'spices'
];

// Express Interest: 'ஆர்வமாக உள்ளேன்', 'வாங்குகிறேன்', 'ஆர்வமுள்ளது', 'interest', 'buy this', 'want', 'விருப்பம்', 'ஆர்வம்'
export const BUYER_EXPRESS_INTEREST_KEYWORDS = [
    'ஆர்வமாக உள்ளேன்', 'வாங்குகிறேன்', 'ஆர்வமுள்ளது', 'interest', 'buy this', 'want',
    'விருப்பம்', 'ஆர்வம்', 'வாங்க', 'வாங்கு', 'வேண்டும்', 'கொடு', 'சரி', 'yes', 'ok', 'ஆம்', 'தேவை',
    'interested', 'purchase', 'order', 'kharid', 'chahiye'
];

// Proceed to Payment / Pay: 'பணம்', 'செலுத்து', 'pay', 'checkout', 'confirm payment'
export const BUYER_PAY_KEYWORDS = [
    'பணம்', 'செலுத்து', 'pay', 'checkout', 'confirm payment',
    'payment', 'paid', 'செலுத்துக', 'yes', 'ok', 'ஆம்', 'சரி', 'done', 'bhugtan'
];

// ─── SELLER FLOW KEYWORDS ───

// Add Product / New Sale: 'புதிய', 'விற்பனை', 'சேர்', 'add', 'new', 'sell', 'create'
export const SELLER_NEW_SALE_KEYWORDS = [
    'புதிய', 'விற்பனை', 'சேர்', 'add', 'new', 'sell', 'create',
    'விற்க', 'விൽപ്പന', 'விற்பனைக்கு', 'பொருளை விற்க', 'புதிய விற்பனை',
    'sale', 'sales', 'new sale', 'new sales', 'listing', 'new listing',
    'bikri', 'bechna', 'naya', 'bano'
];

// Product Name Input: 'தேன்', 'மஞ்சள்', 'கிழங்கு', 'honey', 'turmeric', 'herbs'
export const SELLER_PRODUCT_NAME_KEYWORDS = [
    'தேன்', 'மஞ்சள்', 'கிழங்கு', 'honey', 'turmeric', 'herbs',
    'காட்டுத் தேன்', 'பச்சை மஞ்சள்', 'மிளகு', 'pepper', 'ginger', 'இஞ்சி'
];

// My Products / Inventory: 'பொருட்கள்', 'என்', 'my', 'products', 'list', 'items'
export const SELLER_MY_PRODUCTS_KEYWORDS = [
    'பொருட்கள்', 'என்', 'my', 'products', 'list', 'items',
    'பொருள', 'என் பொருட்கள்', 'விற்பனை பொருட்கள்', 'விற்பனைப் பொருட்கள்',
    'பட்டியல்', 'தயாரிப்புகள்', 'தயாரிப்பு',
    'product', 'listings', 'item', 'samagri', 'utpaad', 'soochi', 'inventory'
];

// Accept Order / Invite: 'ஏற்றுக்கொள்', 'சரி', 'அழைப்பு', 'accept', 'ok', 'yes', 'invite'
export const SELLER_ACCEPT_ORDER_KEYWORDS = [
    'ஏற்றுக்கொள்', 'சரி', 'அழைப்பு', 'accept', 'ok', 'yes', 'invite',
    'ஏற்றுகொள்', 'ஏற்று', 'sari', 'स्वीकार', 'swikar',
    'ha', 'haan', 'done', 'agree'
];

// ─── GLOBAL NAVIGATION KEYWORDS ───

// Home / Dashboard: 'முகப்பு', 'Home', 'main', 'back', 'பின்'
export const GLOBAL_HOME_KEYWORDS = [
    'முகப்பு', 'home', 'main', 'back', 'பின்', 'திரும்ப', 'பின்னால்', 'dashboard'
];

// Repeat / Help: 'மீண்டும்', 'உதவி', 'repeat', 'help'
export const GLOBAL_REPEAT_HELP_KEYWORDS = [
    'மீண்டும்', 'உதவி', 'repeat', 'help', 'again', 'say again', 'வழிமுறை'
];

// Logout
export const LOGOUT_KEYWORDS = [
    'வெளியேறு', 'விலகு', 'logout', 'exit', 'signout', 'quit'
];

// ─── HIGH-LEVEL CLASSIFIER FUNCTIONS ───

export const isSearchIntent = (transcript) => matchesAnyKeyword(transcript, BUYER_SEARCH_KEYWORDS);
export const isBuyerSearchIntent = isSearchIntent;

export const isExpressInterestIntent = (transcript) => matchesAnyKeyword(transcript, BUYER_EXPRESS_INTEREST_KEYWORDS);
export const isBuyerExpressInterestIntent = isExpressInterestIntent;

export const isPaymentIntent = (transcript) => matchesAnyKeyword(transcript, BUYER_PAY_KEYWORDS);
export const isBuyerPayIntent = isPaymentIntent;

export const isMyProductsIntent = (transcript) => {
    const norm = normalizeText(transcript);
    if (norm.includes('விற்பனைப் பொருட்கள்') || norm.includes('விற்பனை பொருட்கள்') || norm.includes('என் பொருட்கள்')) {
        return true;
    }
    return matchesAnyKeyword(transcript, SELLER_MY_PRODUCTS_KEYWORDS);
};
export const isSellerMyProductsIntent = isMyProductsIntent;

export const isNewSaleIntent = (transcript) => {
    const norm = normalizeText(transcript);
    // If user says "விற்பனைப் பொருட்கள்" or "பொருட்கள்", route to listings unless "புதிய" or "add" or "create" is explicitly present
    if ((norm.includes('பொருட்கள்') || norm.includes('items') || norm.includes('products') || norm.includes('list')) && 
        !norm.includes('புதிய') && !norm.includes('add') && !norm.includes('create') && !norm.includes('சேர்')) {
        return false;
    }
    return matchesAnyKeyword(transcript, SELLER_NEW_SALE_KEYWORDS);
};
export const isSellerNewSaleIntent = isNewSaleIntent;

export const isSellerProductNameIntent = (transcript) => matchesAnyKeyword(transcript, SELLER_PRODUCT_NAME_KEYWORDS);

export const isAcceptOrderIntent = (transcript) => matchesAnyKeyword(transcript, SELLER_ACCEPT_ORDER_KEYWORDS);
export const isSellerAcceptOrderIntent = isAcceptOrderIntent;

export const isInterestIntent = (transcript) => matchesAnyKeyword(transcript, [
    'ஆர்வம்', 'புதிய ஆர்வம்', 'வாங்குபவர் ஆர்வம்', 'வாங்குபவர்',
    'interest', 'buyer', 'buyer interest', 'new interest', 'ruchi', 'buyer enquiry'
]);

export const isHomeIntent = (transcript) => matchesAnyKeyword(transcript, GLOBAL_HOME_KEYWORDS);
export const isGlobalHomeIntent = isHomeIntent;

export const isRepeatHelpIntent = (transcript) => matchesAnyKeyword(transcript, GLOBAL_REPEAT_HELP_KEYWORDS);
export const isGlobalRepeatHelpIntent = isRepeatHelpIntent;

export const isLogoutIntent = (transcript) => matchesAnyKeyword(transcript, LOGOUT_KEYWORDS);

// Photo / Snapshot Capture Keywords
export const PHOTO_CAPTURE_KEYWORDS = [
    'படம்', 'புகைப்படம்', 'எடு', 'புகைப்படம் எடு', 'படம் எடு',
    'photo', 'picture', 'take photo', 'capture', 'click', 'snapshot', 'take', 'shoot',
    'சரி', 'ok', 'yes', 'kheecho', 'tasveer', 'photo lo', 'camera'
];

export const isTakePhotoIntent = (transcript) => matchesAnyKeyword(transcript, PHOTO_CAPTURE_KEYWORDS);

// Affirmation / Yes / Confirm Keywords for Step 4 Guardrails:
export const AFFIRMATIVE_KEYWORDS = [
    'ஆம்', 'சரி', 'உறுதி', 'ஏற்றுக்கொள்', 'ஆம் உறுதி', 'சரி செய்',
    'yes', 'confirm', 'ok', 'okay', 'sure', 'accept', 'done', 'proceed',
    'ha', 'haan', 'sari', 'theek', 'theek hai', 'avunu', 'ho'
];

export const isAffirmativeIntent = (transcript) => matchesAnyKeyword(transcript, AFFIRMATIVE_KEYWORDS);

// Negative / No / Cancel Keywords for Step 4 Guardrails:
export const NEGATIVE_KEYWORDS = [
    'இல்லை', 'வேண்டாம்', 'ரத்து', 'வேண்டாம் ரத்து செய்', 'நிறுத்து',
    'no', 'cancel', 'nah', 'stop', 'reject', 'abort', 'dont', 'do not',
    'nahi', 'vaddhu', 'nako', 'na'
];

export const isNegativeIntent = (transcript) => matchesAnyKeyword(transcript, NEGATIVE_KEYWORDS);

// Pickup / Logistics Keywords:
export const PICKUP_LOGISTICS_KEYWORDS = [
    'பிக்-அப்', 'பிக் அப்', 'வாகனம்', 'டெலிவரி', 'ஏற்பாடு', 'பிக்அப்',
    'pickup', 'transport', 'schedule', 'van', 'delivery', 'dispatch', 'logistics',
    'gadi', 'vahan', 'bhejo'
];

export const isPickupIntent = (transcript) => matchesAnyKeyword(transcript, PICKUP_LOGISTICS_KEYWORDS);

// Buy Now Intent:
export const BUY_NOW_KEYWORDS = [
    'வாங்கு', 'இப்போதே வாங்கு', 'வாங்க', 'வாங்குகிறேன்', 'buy', 'buy now', 'purchase', 'order', 'kharido', 'chahiye'
];
export const isBuyNowIntent = (transcript) => matchesAnyKeyword(transcript, BUY_NOW_KEYWORDS);

// Pack Order Intent:
export const PACK_ORDER_KEYWORDS = [
    'பேக் செய்', 'பேக்கிங்', 'பேக்', 'pack', 'pack order', 'packing', 'ready'
];
export const isPackOrderIntent = (transcript) => matchesAnyKeyword(transcript, PACK_ORDER_KEYWORDS);

// Order Received Intent:
export const ORDER_RECEIVED_KEYWORDS = [
    'பொருளைப் பெற்றேன்', 'பெற்றேன்', 'கிடைத்தது', 'received', 'order received', 'got it', 'delivered', 'mil gaya'
];
export const isOrderReceivedIntent = (transcript) => matchesAnyKeyword(transcript, ORDER_RECEIVED_KEYWORDS);

// Order History Intent:
export const ORDER_HISTORY_KEYWORDS = [
    'வரலாறு', 'ஆர்டர் வரலாறு', 'விற்பனை வரலாறு', 'history', 'order history', 'past orders', 'sales history'
];
export const isOrderHistoryIntent = (transcript) => matchesAnyKeyword(transcript, ORDER_HISTORY_KEYWORDS);

// Dispatch / Package Moving Intent:
export const DISPATCH_KEYWORDS = [
    'புறப்பட்டது', 'அனுப்பு', 'பயணம்', 'பார்சல் புறப்பட்டது', 'பார்சல் அனுப்பு', 'dispatch', 'handover', 'moving', 'in transit', 'package moving'
];
export const isDispatchIntent = (transcript) => matchesAnyKeyword(transcript, DISPATCH_KEYWORDS);

// Digit Extraction from Voice (Tamil, English, Hindi number words & numerals):
export const extractDigitsFromVoice = (text) => {
    if (!text || typeof text !== 'string') return '';
    
    // Direct numerical digits
    const direct = text.replace(/\D/g, '');
    if (direct.length >= 10) {
        return direct.slice(0, 10);
    }

    const wordToDigit = {
        // English
        'zero': '0', 'oh': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
        'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
        // Tamil formal & colloquial
        'பூஜ்ஜியம்': '0', 'ஒன்று': '1', 'இரண்டு': '2', 'மூன்று': '3', 'நான்கு': '4',
        'ஐந்து': '5', 'ஆறு': '6', 'ஏழு': '7', 'எட்டு': '8', 'ஒன்பது': '9',
        'ஒன்னு': '1', 'ரெண்டு': '2', 'மூணு': '3', 'நாலு': '4', 'அஞ்சு': '5',
        'ஒம்போது': '9', 'ஒம்பது': '9',
        // Tanglish
        'onnu': '1', 'rendu': '2', 'moonu': '3', 'naalu': '4', 'anju': '5',
        'aaru': '6', 'ezhu': '7', 'ettu': '8', 'ombadhu': '9', 'poojiyam': '0',
        // Hindi
        'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4',
        'पाँच': '5', 'पांच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
        'ek': '1', 'do': '2', 'teen': '3', 'char': '4', 'paanch': '5',
        'chhah': '6', 'saat': '7', 'aath': '8', 'nau': '9', 'shunya': '0'
    };

    let result = '';
    const clean = text.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’]/g, ' ');
    const tokens = clean.split(/\s+/).filter(Boolean);

    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            result += token;
        } else if (wordToDigit[token]) {
            result += wordToDigit[token];
        }
    }

    return result.slice(0, 10);
};

// Backspace / Delete Digit Intent
export const isDeleteDigitIntent = (transcript) => matchesAnyKeyword(transcript, [
    'அழி', 'பின்', 'நீக்கு', 'delete', 'backspace', 'remove', 'hatao', 'peeche'
]);

// Clear All Digits Intent
export const isClearAllDigitsIntent = (transcript) => matchesAnyKeyword(transcript, [
    'முழுதும் அழி', 'அனைத்தும் நீக்கு', 'clear', 'reset', 'clear all', 'saaf karo'
]);
