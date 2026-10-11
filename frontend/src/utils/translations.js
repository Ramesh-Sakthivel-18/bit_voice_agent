export const TRANSLATIONS = {
    'ta-IN': {
        namePrompt: "உங்கள் பெயர் என்ன?",
        villagePrompt: "நீங்கள் எந்த கிராமத்தைச் சேர்ந்தவர்?",
        phonePrompt: "உங்கள் பத்து இலக்க தொலைபேசி எண்ணைக் கூறவும்",
        facePrompt: "கேமராவைப் பாருங்கள். நாங்கள் உங்கள் புகைப்படத்தை எடுக்கிறோம்.",
        rolePrompt: "நீங்கள் வாங்க வந்தீர்களா அல்லது விற்க வந்தீர்களா?",
        nameUI: "பெயர்",
        villageUI: "கிராமம்",
        phoneUI: "தொலைபேசி",
        photoUI: "புகைப்படம் எடுக்கவும்",
        whatAreYouUI: "நீங்கள் யார்?",
        buyerUI: "வாங்குபவர்",
        sellerUI: "விற்பனையாளர்",
        doneUI: "முடிந்தது"
    },
    'hi-IN': {
        namePrompt: "आपका नाम क्या है?",
        villagePrompt: "आप किस गांव से हैं?",
        phonePrompt: "अपना दस अंकों का फोन नंबर बताएं",
        facePrompt: "कैमरे में देखें। हम आपकी फोटो ले रहे हैं।",
        rolePrompt: "आप खरीदना चाहते हैं या बेचना?",
        nameUI: "नाम",
        villageUI: "गांव",
        phoneUI: "फोन",
        photoUI: "फोटो लें",
        whatAreYouUI: "आप क्या हैं?",
        buyerUI: "खरीदार",
        sellerUI: "विक्रेता",
        doneUI: "पूर्ण"
    },
    'te-IN': {
        namePrompt: "మీ పేరు ఏమిటి?",
        villagePrompt: "మీది ఏ ఊరు?",
        phonePrompt: "దయచేసి మీ పది అంకెల ఫోన్ నంబర్‌ను చెప్పండి",
        facePrompt: "కెమెరా వైపు చూడండి. మేము మీ ఫోటో తీసుకుంటున్నాము.",
        rolePrompt: "మీరు కొనడానికి వచ్చారా లేదా అమ్మడానికి వచ్చారా?",
        nameUI: "పేరు",
        villageUI: "ఊరు",
        phoneUI: "ఫోన్",
        photoUI: "ఫోటో తీయండి",
        whatAreYouUI: "మీరు కొనుగోలుదారా లేదా విక్రేతనా?",
        buyerUI: "కొనుగోలుదారు",
        sellerUI: "విక్రేత",
        doneUI: "పూర్తయింది"
    },
    'en-IN': {
        namePrompt: "What is your name?",
        villagePrompt: "Which village are you from?",
        phonePrompt: "Please say your 10-digit phone number.",
        facePrompt: "Look at the screen. We are taking a photo.",
        rolePrompt: "Are you here to buy or sell?",
        nameUI: "Name",
        villageUI: "Village",
        phoneUI: "Phone",
        photoUI: "Take Photo",
        whatAreYouUI: "What are you?",
        buyerUI: "Buyer",
        sellerUI: "Seller",
        doneUI: "Done"
    }
};

export const getTranslation = (langCode) => {
    return TRANSLATIONS[langCode] || TRANSLATIONS['en-IN'];
};
