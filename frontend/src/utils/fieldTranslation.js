/**
 * Universal Database Field Translation Engine
 * 
 * Dynamically renders database-stored strings (stored strictly in English)
 * into the active session language (Tamil, Hindi, etc.) without mutating DB records.
 * If the active language is English ('en-IN', 'en'), it renders clean English.
 */

// 1. Language Resolution Helper
export const getActiveLanguage = () => {
    if (typeof window === 'undefined') return 'ta-IN';
    return (
        sessionStorage.getItem('appLanguage') ||
        localStorage.getItem('language') ||
        localStorage.getItem('selected_language') ||
        'ta-IN'
    );
};

// 2. Comprehensive Agricultural Produce Dictionary
const PRODUCE_DICTIONARY = {
    'ta': {
        'organic turmeric': 'இயற்கை மஞ்சள்',
        'raw turmeric': 'பச்சை மஞ்சள்',
        'wild turmeric': 'காட்டு மஞ்சள்',
        'turmeric': 'மஞ்சள்',
        'manjal': 'மஞ்சள்',
        'haldi': 'மஞ்சள்',

        'wild forest honey': 'காட்டுத் தேன்',
        'forest honey': 'காட்டுத் தேன்',
        'organic honey': 'இயற்கைத் தேன்',
        'raw honey': 'இயற்கைத் தேன்',
        'pure honey': 'தூய தேன்',
        'honey': 'தேன்',
        'then': 'தேன்',

        'black pepper': 'கருப்பு மிளகு',
        'pepper': 'மிளகு',
        'milagu': 'மிளகு',

        'cardamom': 'ஏலக்காய்',
        'green cardamom': 'பச்சை ஏலக்காய்',
        'elakkai': 'ஏலக்காய்',

        'cloves': 'கிராம்பு',
        'clove': 'கிராம்பு',
        'kirambu': 'கிராம்பு',
        'lavangam': 'கிராம்பு',

        'dry ginger': 'சுக்கு',
        'sukku': 'சுக்கு',
        'ginger': 'இஞ்சி',
        'inji': 'இஞ்சி',

        'hill garlic': 'மலைப் பூண்டு',
        'garlic': 'பூண்டு',
        'poondu': 'பூண்டு',

        'amla': 'நெல்லிக்காய்',
        'gooseberry': 'நெல்லிக்காய்',
        'nellikai': 'நெல்லிக்காய்',

        'nutmeg': 'ஜாதிக்காய்',
        'jathikai': 'ஜாதிக்காய்',

        'cinnamon': 'இலவங்கப்பட்டை',
        'lavangapattai': 'இலவங்கப்பட்டை',

        'millets': 'சிறுதானியங்கள்',
        'millet': 'சிறுதானியம்',
        'ragi': 'கேழ்வரகு',
        'kambu': 'கம்பு',
        'thinai': 'தினை',
        'samai': 'சாமை',
        'varagu': 'வரகு',
        'kuthiraivali': 'குதிரைவாலி',

        'tamarind': 'புளி',
        'puli': 'புளி',

        'moringa': 'முருங்கை',
        'murungai': 'முருங்கை',
        'moringa leaves': 'முருங்கைக்கீரை',

        'coffee': 'காபி',
        'coffee beans': 'காபி கொட்டை',
        'arabica coffee': 'அராபிகா காபி',

        'tea': 'தேயிலை',
        'organic tea': 'இயற்கை தேயிலை',

        'herbs': 'மூலிகைகள்',
        'herb': 'மூலிகை',
        'mooligai': 'மூலிகைகள்',
        'medicinal plants': 'மருத்துவ மூலிகைகள்',

        'neem': 'வேப்பிலை',
        'vembu': 'வேப்பிலை',

        'tulsi': 'துளசி',
        'thulasi': 'துளசி',

        'ashwagandha': 'அமுக்கரா கிழங்கு',
        'amukkara': 'அமுக்கரா கிழங்கு',

        'triphala': 'திரிபலா',

        'mustard': 'கடுகு',
        'kadugu': 'கடுகு',

        'cumin': 'சீரகம்',
        'jeeragam': 'சீரகம்',

        'fenugreek': 'வெந்தயம்',
        'vendhayam': 'வெந்தயம்',

        'coriander': 'கொத்தமல்லி',
        'kothamalli': 'கொத்தமல்லி',

        'chilli': 'மிளகாய்',
        'red chilli': 'சிவப்பு மிளகாய்',
        'milagai': 'மிளகாய்',

        'curry leaves': 'கறிவேப்பிலை',
        'karuveppilai': 'கறிவேப்பிலை',

        'coconut': 'தேங்காய்',
        'thengai': 'தேங்காய்',

        'country sugar': 'நாட்டுச் சர்க்கரை',
        'nattu sakkarai': 'நாட்டுச் சர்க்கரை',
        'jaggery': 'வெல்லம்',
        'vellam': 'வெல்லம்',

        'palm jaggery': 'பனை கருப்பட்டி',
        'karupatti': 'கருப்பட்டி'
    },
    'hi': {
        'organic turmeric': 'जैविक हल्दी',
        'raw turmeric': 'कच्ची हल्दी',
        'wild turmeric': 'जंगली हल्दी',
        'turmeric': 'हल्दी',

        'wild forest honey': 'जंगली शहद',
        'forest honey': 'वन शहद',
        'organic honey': 'जैविक शहद',
        'pure honey': 'शुद्ध शहद',
        'honey': 'शहद',

        'black pepper': 'काली मिर्च',
        'pepper': 'काली मिर्च',

        'cardamom': 'इलायची',
        'cloves': 'लौंग',
        'dry ginger': 'सोंठ',
        'ginger': 'अदरक',
        'hill garlic': 'पहाड़ी लहसुन',
        'garlic': 'लहसुन',
        'amla': 'आंवला',
        'cinnamon': 'दालचीनी',
        'millets': 'मोटे अनाज / बाजरा',
        'tamarind': 'इमली',
        'moringa': 'सहजन',
        'coffee': 'कॉफ़ी',
        'tea': 'चाय पत्ती',
        'herbs': 'जड़ी-बूटियाँ',
        'tulsi': 'तुलसी',
        'jaggery': 'गुड़'
    }
};

// 3. Units Dictionary
const UNITS_DICTIONARY = {
    'ta': {
        'kg': 'கிலோ',
        'kgs': 'கிலோ',
        'kilo': 'கிலோ',
        'kilos': 'கிலோ',
        'kilogram': 'கிலோ',
        'kilograms': 'கிலோ',
        'gram': 'கிராம்',
        'grams': 'கிராம்',
        'g': 'கிராம்',
        'gm': 'கிராம்',
        'gms': 'கிராம்',
        'unit': 'அலகுகள்',
        'units': 'அலகுகள்',
        'nos': 'அலகுகள்',
        'item': 'பொருள்',
        'items': 'பொருட்கள்',
        'liter': 'லிட்டர்',
        'liters': 'லிட்டர்',
        'litre': 'லிட்டர்',
        'litres': 'லிட்டர்',
        'l': 'லிட்டர்',
        'bag': 'மூட்டை',
        'bags': 'மூட்டை',
        'sack': 'மூட்டை',
        'sacks': 'மூட்டை',
        'packet': 'பாக்கெட்',
        'packets': 'பாக்கெட்',
        'pack': 'பாக்கெட்',
        'packs': 'பாக்கெட்',
        'box': 'பெட்டி',
        'boxes': 'பெட்டி',
        'bottle': 'பாட்டில்',
        'bottles': 'பாட்டில்'
    },
    'hi': {
        'kg': 'किलो',
        'kgs': 'किलो',
        'kilo': 'किलो',
        'gram': 'ग्राम',
        'grams': 'ग्राम',
        'unit': 'इकाई',
        'units': 'इकाइयाँ',
        'liter': 'लीटर',
        'bag': 'बोरी',
        'box': 'डिब्बा',
        'bottle': 'बोतल'
    }
};

// 4. Locations & Villages Dictionary (Handles composites like "kaniyur,udumpettai")
const LOCATIONS_DICTIONARY = {
    'ta': {
        'kaniyur': 'கணியூர்',
        'udumpettai': 'உடுமலைப்பேட்டை',
        'udumalpet': 'உடுமலைப்பேட்டை',
        'udumalaipettai': 'உடுமலைப்பேட்டை',
        'nilgiris': 'நீலகிரி',
        'nilgiris forest': 'நீலகிரி காடு',
        'ooty': 'ஊட்டி',
        'udhagamandalam': 'உதகமண்டலம்',
        'sathyamangalam': 'சத்தியமங்கலம்',
        'sathy': 'சத்தியமங்கலம்',
        'sathyamangalam forest': 'சத்தியமங்கலம் காடு',
        'valparai': 'வால்பாறை',
        'pollachi': 'பொள்ளாச்சி',
        'coimbatore': 'கோயம்புத்தூர்',
        'kovai': 'கோவை',
        'erode': 'ஈரோடு',
        'salem': 'சேலம்',
        'kolli hills': 'கொல்லிமலை',
        'kolli': 'கொல்லிமலை',
        'kolli malai': 'கொல்லிமலை',
        'javadi hills': 'ஜவ்வாது மலை',
        'javadi': 'ஜவ்வாது மலை',
        'yercaud': 'ஏற்காடு',
        'dindigul': 'திண்டுக்கல்',
        'madurai': 'மதுரை',
        'tiruppur': 'திருப்பூர்',
        'tirupur': 'திருப்பூர்',
        'dharmapuri': 'தர்மபுரி',
        'krishnagiri': 'கிருஷ்ணகிரி',
        'vellore': 'வேலூர்',
        'namakkal': 'நாமக்கல்',
        'theni': 'தேனி',
        'kodaikanal': 'கொடைக்கானல்',
        'megamalai': 'மேகமலை',
        'anaimalai': 'ஆனைமலை',
        'kalrayan hills': 'கல்வராயன் மலை',
        'gudalur': 'கூடலூர்',
        'kotagiri': 'கோத்தகிரி',
        'coonoor': 'குன்னூர்',
        'mettupalayam': 'மேட்டுப்பாளையம்',
        'bhavani': 'பவானி',
        'gobichettipalayam': 'கோபிசெட்டிபாளையம்',
        'gobi': 'கோபிசெட்டிபாளையம்',
        'anthiyur': 'அந்தியூர்',
        'talavadi': 'தாளவாடி',
        'bargur': 'பர்கூர்',
        'thirumoorthy hills': 'திருமூர்த்தி மலை',
        'thirumoorthy': 'திருமூர்த்தி மலை',
        'amaravathi': 'அமராவதி',
        'madathukulam': 'மடத்துக்குளம்',
        'dharapuram': 'தாராபுரம்',
        'palladam': 'பல்லடம்',
        'kangeyam': 'காங்கேயம்',
        'vellakoil': 'வெள்ளக்கோவில்',
        'perundurai': 'பெருந்துறை',
        'chennimalai': 'சென்னிமலை',
        'kodumudi': 'கொடுமுடி',
        'tamil nadu': 'தமிழ்நாடு',
        'tamilnadu': 'தமிழ்நாடு',
        'india': 'இந்தியா',
        'farmer resource center': 'விவசாய வள மையம்',
        'farmer hub': 'விவசாயிகள் மையம்',
        'village center': 'கிராம மையம்',
        'rural hub': 'கிராமப்புற மையம்',
        'forest': 'காடு',
        'village': 'கிராமம்'
    },
    'hi': {
        'kaniyur': 'कनियूर',
        'udumpettai': 'उदुमलाईपेट्टई',
        'udumalpet': 'उदुमलाईपेट्टई',
        'nilgiris': 'नीलगिरि',
        'nilgiris forest': 'नीलगिरि वन',
        'sathyamangalam': 'सत्यमंगलम',
        'valparai': 'वालपारई',
        'pollachi': 'पोलाची',
        'coimbatore': 'कोयंबटूर',
        'erode': 'इरोड',
        'salem': 'सलेम',
        'madurai': 'मदुरै',
        'tamil nadu': 'तमिलनाडु'
    }
};

// 5. Common Names Dictionary (Buyer, Seller, Logistics Drivers)
const NAMES_DICTIONARY = {
    'ta': {
        'vikash': 'விகாஷ்',
        'vikas': 'விகாஷ்',
        'vignesh': 'விக்னேஷ்',
        'raman': 'ராமன்',
        'ramanan': 'ரமணன்',
        'priya': 'பிரியா',
        'murugan': 'முருகன்',
        'murugesh': 'முருகேஷ்',
        'ramesh': 'ரமேஷ்',
        'suresh': 'சுரேஷ்',
        'rajesh': 'ராஜேஷ்',
        'kumar': 'குமார்',
        'kumaran': 'குமரன்',
        'selvan': 'செல்வன்',
        'selvi': 'செல்வி',
        'kavitha': 'கவிதா',
        'anita': 'அனிதா',
        'anitha': 'அனிதா',
        'mani': 'மணி',
        'manikandan': 'மணிகண்டன்',
        'saravanan': 'சரவணன்',
        'karthik': 'கார்த்திக்',
        'karthikeyan': 'கார்த்திக்',
        'muthu': 'முத்து',
        'palani': 'பழனி',
        'palanisamy': 'பழனிசாமி',
        'marimuthu': 'மாரிமுத்து',
        'arun': 'அருண்',
        'arunkumar': 'அருண்குமார்',
        'velu': 'வேலு',
        'velusamy': 'வேலுசாமி',
        'lakshmi': 'லட்சுமி',
        'meena': 'மீனா',
        'sangeetha': 'சங்கீதா',
        'deepa': 'தீபா',
        'radha': 'ராதா',
        'shanthi': 'சாந்தி',
        'revathi': 'ரேவதி',
        'poongodi': 'பூங்கொடி',
        'valli': 'வள்ளி',
        'senthil': 'செந்தில்',
        'dhanush': 'தனுஷ்',
        'naveen': 'நவீன்',
        'prakash': 'பிரகாஷ்',
        'anand': 'ஆனந்த்',
        'vijay': 'விஜய்',
        'ajith': 'அஜித்',
        'siva': 'சிவா',
        'ganesh': 'கணேஷ்',
        'bala': 'பாலா',
        'babu': 'பாபு',
        'ravi': 'ரவி',
        'raja': 'ராஜா',
        'mohan': 'மோகன்',
        'dinesh': 'தினேஷ்',
        'seller': 'விற்பனையாளர்',
        'buyer': 'வாங்குபவர்',
        'farmer': 'விவசாயி',
        'producer': 'உற்பத்தியாளர்',
        'driver': 'ஓட்டுநர்'
    },
    'hi': {
        'vikash': 'विकास',
        'vikas': 'विकास',
        'raman': 'रमन',
        'priya': 'प्रिया',
        'murugan': 'मुरुगन',
        'ramesh': 'रमेश',
        'suresh': 'सुरेश',
        'rajesh': 'राजेश',
        'kumar': 'कुमार',
        'kavitha': 'कविता',
        'anita': 'अनिता',
        'karthik': 'कार्तिक',
        'arun': 'अरुण',
        'seller': 'विक्रेता',
        'buyer': 'खरीदार',
        'driver': 'चालक'
    }
};

// 6. Statuses Dictionary
const STATUSES_DICTIONARY = {
    'ta': {
        'order_placed': 'ஆர்டர் செய்யப்பட்டது',
        'payment_completed': 'கட்டணம் செலுத்தப்பட்டது',
        'payment_paid': 'கட்டணம் செலுத்தப்பட்டது',
        'order_confirmed': 'ஆர்டர் உறுதி செய்யப்பட்டது',
        'order_packed': 'ஆர்டர் பேக் செய்யப்பட்டது',
        'pickup_scheduled': 'பிக்-அப் திட்டமிடப்பட்டது',
        'package_moving': 'பார்சல் பயணத்தில் உள்ளது',
        'order_received': 'ஆர்டர் பெறப்பட்டது',
        'delivered': 'விநியோகிக்கப்பட்டது',
        'processing': 'செயலாக்கத்தில் உள்ளது',
        'interest_expressed': 'ஆர்வம் தெரிவிக்கப்பட்டது',
        'invitation_accepted': 'அழைப்பு ஏற்கப்பட்டது',
        'delivered & received': 'விநியோகிக்கப்பட்டு பெறப்பட்டது',
        'delivery completed': 'டெலிவரி முடிந்தது'
    },
    'hi': {
        'order_placed': 'ऑर्डर दिया गया',
        'payment_completed': 'भुगतान पूरा हुआ',
        'payment_paid': 'भुगतान पूरा हुआ',
        'order_confirmed': 'ऑर्डर कन्फर्म',
        'order_packed': 'ऑर्डर पैक हुआ',
        'pickup_scheduled': 'पिकअप निर्धारित',
        'package_moving': 'पैकेज रास्ते में है',
        'order_received': 'ऑर्डर प्राप्त हुआ',
        'delivered': 'डिलीवर किया गया',
        'processing': 'प्रक्रिया में है'
    }
};

// 7. Intelligent Phonetic Transliteration (English -> Tamil) for unknown personal/village names
const transliterateToTamil = (word) => {
    if (!word || typeof word !== 'string') return '';
    const clean = word.toLowerCase().trim();
    if (!/^[a-z]+$/i.test(clean)) return word; // If not purely latin letters, return as-is

    // Syllable & Cluster Map
    const clusters = [
        ['sh', 'ஷ்'], ['zh', 'ழ்'], ['th', 'த்'], ['dh', 'த்'],
        ['ch', 'ச்'], ['kh', 'க்'], ['gh', 'க்'], ['ph', 'ப்'],
        ['bh', 'ப்'], ['ng', 'ங்'], ['nj', 'ஞ்'], ['nd', 'ண்ட்'],
        ['nt', 'ண்ட்'], ['mb', 'ம்ப'], ['mp', 'ம்ப']
    ];

    let result = '';
    let i = 0;
    const len = clean.length;

    while (i < len) {
        // Check 2-letter clusters
        let matchedCluster = null;
        if (i + 1 < len) {
            const pair = clean.slice(i, i + 2);
            for (const [c, t] of clusters) {
                if (pair === c) {
                    matchedCluster = t;
                    i += 2;
                    break;
                }
            }
        }

        if (matchedCluster) {
            result += matchedCluster;
            continue;
        }

        const char = clean[i];
        const next = i + 1 < len ? clean[i + 1] : '';

        // Vowel at word boundary
        if (i === 0) {
            if (char === 'a') { result += (next === 'a' ? (i++, 'ஆ') : 'அ'); i++; continue; }
            if (char === 'e') { result += (next === 'e' ? (i++, 'ஈ') : 'எ'); i++; continue; }
            if (char === 'i') { result += 'இ'; i++; continue; }
            if (char === 'o') { result += (next === 'o' ? (i++, 'ஊ') : 'ஒ'); i++; continue; }
            if (char === 'u') { result += 'உ'; i++; continue; }
        }

        // Consonant mappings
        switch (char) {
            case 'k': case 'g': result += 'க'; break;
            case 's': case 'c': result += 'ச'; break;
            case 'j': result += 'ஜ'; break;
            case 't': case 'd': result += 'த'; break;
            case 'n': result += 'ன'; break;
            case 'p': case 'b': result += 'ப'; break;
            case 'm': result += 'ம'; break;
            case 'y': result += 'ய'; break;
            case 'r': result += 'ர'; break;
            case 'l': result += 'ல'; break;
            case 'v': case 'w': result += 'வ'; break;
            case 'h': result += 'ஹ'; break;
            default: break;
        }
        i++;
    }

    return result || word;
};

/**
 * Universal Translation Function:
 * Translates any database-stored English string into the active language script.
 * 
 * @param {string} text - The raw text from the database (e.g. "Organic Turmeric", "kaniyur,udumpettai", "vikash", "kg")
 * @param {string} [categoryOrLang] - Optional category ('title'|'name'|'location'|'unit'|'status') or direct language code ('ta-IN')
 * @param {string} [explicitLang] - Optional explicit language code ('ta-IN', 'en-IN', 'hi-IN')
 * @returns {string} Fully localized string in native script (or clean English if in English mode)
 */
export const translateField = (text, categoryOrLang, explicitLang) => {
    if (!text || typeof text !== 'string') return text || '';
    const raw = text.trim();
    if (!raw) return '';

    // Determine target language
    let lang = explicitLang;
    if (!lang) {
        if (categoryOrLang && categoryOrLang.includes('-')) {
            lang = categoryOrLang;
        } else {
            lang = getActiveLanguage();
        }
    }

    const langPrefix = (lang || 'ta-IN').split('-')[0].toLowerCase();

    // In English mode, return clean English string
    if (langPrefix === 'en') {
        // If string is composite with commas like "kaniyur,udumpettai", format nicely as "kaniyur, udumpettai"
        if (raw.includes(',')) {
            return raw.split(',').map(s => s.trim()).join(', ');
        }
        return raw;
    }

    const norm = raw.toLowerCase().trim();

    // 1. Composite location/text containing comma (e.g. "kaniyur,udumpettai" or "Nilgiris, Tamil Nadu")
    if (norm.includes(',')) {
        const parts = norm.split(',').map(p => p.trim()).filter(Boolean);
        const translatedParts = parts.map(part => {
            const locDict = LOCATIONS_DICTIONARY[langPrefix] || LOCATIONS_DICTIONARY['ta'];
            if (locDict[part]) return locDict[part];
            const nameDict = NAMES_DICTIONARY[langPrefix] || NAMES_DICTIONARY['ta'];
            if (nameDict[part]) return nameDict[part];
            if (langPrefix === 'ta') return transliterateToTamil(part);
            return part;
        });
        return translatedParts.join(', ');
    }

    // 2. Status check
    const statusDict = STATUSES_DICTIONARY[langPrefix] || STATUSES_DICTIONARY['ta'];
    if (statusDict[norm]) {
        return statusDict[norm];
    }

    // 3. Units check
    const unitDict = UNITS_DICTIONARY[langPrefix] || UNITS_DICTIONARY['ta'];
    if (unitDict[norm]) {
        return unitDict[norm];
    }

    // 4. Produce / Product Title check
    const prodDict = PRODUCE_DICTIONARY[langPrefix] || PRODUCE_DICTIONARY['ta'];
    if (prodDict[norm]) {
        return prodDict[norm];
    }

    // Substring produce match (e.g. "Pure Wild Forest Honey 500g" -> "காட்டுத் தேன்")
    for (const [key, val] of Object.entries(prodDict)) {
        if (norm.includes(key)) {
            return val;
        }
    }

    // 5. Locations check
    const locDict = LOCATIONS_DICTIONARY[langPrefix] || LOCATIONS_DICTIONARY['ta'];
    if (locDict[norm]) {
        return locDict[norm];
    }

    // 6. Names check
    const nameDict = NAMES_DICTIONARY[langPrefix] || NAMES_DICTIONARY['ta'];
    if (nameDict[norm]) {
        return nameDict[norm];
    }

    // 7. Special Logistics partner format:
    // e.g. "TRIFED Rural Logistics • Van #TN-43-A-1284 (Driver: Murugan • 📞 98421 54321)"
    if (norm.includes('trifed') || norm.includes('logistics') || norm.includes('van #')) {
        if (langPrefix === 'ta') {
            return raw
                .replace(/TRIFED Rural Logistics/gi, 'TRIFED கிராமப்புற விநியோகம்')
                .replace(/Van\s*#/gi, 'வாகனம் #')
                .replace(/Driver:\s*Murugan/gi, 'ஓட்டுநர்: முருகன்')
                .replace(/Driver:\s*/gi, 'ஓட்டுநர்: ')
                .replace(/Farmer Resource Center/gi, 'விவசாய வள மையம்');
        }
        if (langPrefix === 'hi') {
            return raw
                .replace(/TRIFED Rural Logistics/gi, 'ट्राईफेड ग्रामीण लॉजिस्टिक्स')
                .replace(/Van\s*#/gi, 'गाड़ी #')
                .replace(/Driver:\s*Murugan/gi, 'चालक: मुरुगन');
        }
    }

    // 8. If purely latin letters and Tamil is active, phonetically transliterate personal/place names
    if (langPrefix === 'ta' && /^[a-z\s]+$/i.test(norm)) {
        const words = norm.split(/\s+/);
        const transliterated = words.map(w => {
            if (nameDict[w]) return nameDict[w];
            if (locDict[w]) return locDict[w];
            return transliterateToTamil(w);
        });
        return transliterated.join(' ');
    }

    // Fallback: return original text
    return raw;
};

/**
 * React Hook for seamless dynamic database field translation
 */
export const useFieldTranslation = (overrideLang) => {
    const lang = overrideLang || getActiveLanguage();
    const isTamil = lang.startsWith('ta');
    const isEnglish = lang.startsWith('en');

    const tf = (text, category) => translateField(text, category, lang);

    return {
        translateField: tf,
        tf,
        lang,
        isTamil,
        isEnglish
    };
};

export default translateField;
