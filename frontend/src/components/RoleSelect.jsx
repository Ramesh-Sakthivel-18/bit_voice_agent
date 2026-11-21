import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getTranslation } from '../utils/translations';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { matchesAnyKeyword, normalizeText } from '../utils/voiceMatcher';

const ROLE_KEYWORDS = {
    buyer: ['வாங்க', 'வாங்குபவர்', 'buyer', 'buy', 'खरीदार', 'खरीदना', 'కొనుగోలుదారు', 'కొనడానికి', 'vang', 'vaang', 'kharid', 'வாங்கு'],
    seller: ['விற்பனை', 'விற்க', 'seller', 'sell', 'வியாபாரி', 'விற்பனையாளர்', 'विक्रेता', 'बेचना', 'విక్రేత', 'అమ్మడానికి', 'virk', 'vikka', 'bech', 'vyapari', 'விൽപ്പന']
};

export const RoleSelect = ({ language, onSelect }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak,
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const [statusText, setStatusText] = useState('');
    const [selectedRole, setSelectedRole] = useState(null);
    const selectedRef = useRef(false);
    
    const t = getTranslation(language);

    const confirmRole = useCallback((role) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        setSelectedRole(role);

        window.speechSynthesis.cancel();
        const confirmText = language === 'ta-IN'
            ? (role === 'seller' ? "சரி, நீங்கள் விற்பனையாளர் என பதிவு செய்கிறேன்." : "சரி, நீங்கள் வாங்குபவர் என பதிவு செய்கிறேன்.")
            : (role === 'seller' ? "Understood, setting you up as a Seller." : "Understood, setting you up as a Buyer.");
            
        setStatusText(`✅ ${confirmText}`);
        speak(confirmText, language);

        setTimeout(() => {
            onSelect(role);
        }, 1600);
    }, [language, onSelect, speak]);

    useEffect(() => {
        const pageCtx = language === 'ta-IN' ? "பாத்திரம் தேர்வு / Select Role" : "Select Role";
        setPageContext(pageCtx);

        const prompt = language === 'ta-IN' 
            ? "வணக்கம்! நீங்கள் பொருட்களை விற்க வந்துள்ளீர்களா, அல்லது வாங்க வந்துள்ளீர்களா? சொல்லுங்கள்."
            : (t.rolePrompt || "Are you here to buy or sell products? Please speak.");
        
        setScreenInstruction(prompt, true);

        const guide = language === 'ta-IN'
            ? "விற்க விரும்பினால் 'விற்பனை' என்றும், வாங்க விரும்பினால் 'வாங்க' என்றும் சொல்லுங்கள்."
            : "Say 'Seller' or 'Buyer' into the microphone below.";
        setGuidePrompt(guide);

        // Register Voice Handler with fuzzy keyword matching
        const handleVoiceInput = (rawText) => {
            if (selectedRef.current || !rawText) return;
            const text = normalizeText(rawText);
            console.log("[Role Select Voice Input]:", text);

            if (matchesAnyKeyword(text, ROLE_KEYWORDS.buyer)) {
                confirmRole('buyer');
            } else if (matchesAnyKeyword(text, ROLE_KEYWORDS.seller)) {
                confirmRole('seller');
            } else {
                const retry = language === 'ta-IN'
                    ? "பொருட்களை விற்க வேண்டுமானால் 'விற்பனை' என்று சொல்லுங்கள். வாங்க வேண்டுமானால் 'வாங்க' என்று சொல்லுங்கள்."
                    : "Say 'Sell' or 'Buy' to choose your role.";
                setStatusText(retry);
                speak(retry, language);
            }
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
            setPageContext('');
        };
    }, [language, t.rolePrompt, setPageContext, setScreenInstruction, setGuidePrompt, registerVoiceHandler, unregisterVoiceHandler, confirmRole, speak]);

    return (
        <div className="w-full max-w-3xl text-center flex flex-col items-center p-6 pb-36">
            <h1 className="text-3xl md:text-5xl font-black text-slate-900 mb-3">
                {language === 'ta-IN' ? "உங்கள் பாத்திரத்தைத் தேர்ந்தெடுக்கவும்" : "Select Your Role"}
            </h1>
            <p className="text-slate-600 text-sm md:text-base max-w-lg mb-8 leading-relaxed">
                {language === 'ta-IN'
                    ? "நீங்கள் விளைபொருட்களை விற்க விரும்புகிறீர்களா, அல்லது வாங்க விரும்புகிறீர்களா?"
                    : "Are you here to sell agricultural produce, or purchase directly from producers?"}
            </p>

            {/* Status / Feedback Pill (No local mic buttons, no middle mic orbs) */}
            <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl px-6 py-4 mb-10 shadow-sm text-center min-h-[56px] flex items-center justify-center">
                <span className={`text-base font-bold ${selectedRole ? 'text-emerald-700' : 'text-blue-700'}`}>
                    {statusText || (language === 'ta-IN' ? "கீழே உள்ள மைக்கை இரட்டை தட்டி 'விற்பனை' அல்லது 'வாங்க' என்று சொல்லுங்கள்" : "Double-tap bottom mic & say 'Sell' or 'Buy'")}
                </span>
            </div>

            {/* Visual Role Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
                {/* Buyer Card */}
                <div 
                    onClick={() => confirmRole('buyer')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-300 cursor-pointer hover:scale-[1.02] shadow-sm
                    ${selectedRole === 'buyer' 
                        ? 'bg-amber-50 border-amber-500 shadow-md' 
                        : 'bg-white border-slate-200 hover:border-amber-400 hover:shadow-md'}
                    ${selectedRole && selectedRole !== 'buyer' ? 'opacity-30 pointer-events-none' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-sm">🛒</div>
                    <div className="text-2xl font-black text-amber-700">
                        {t.buyerUI || "வாங்குபவர்"}
                    </div>
                    <div className="text-slate-600 mt-2 text-sm">(Buyer / Wholesale)</div>
                    <p className="text-slate-600 text-xs mt-3 text-center">
                        {language === 'ta-IN' ? "உற்பத்தியாளர்களிடமிருந்து நேரடியாக வாங்க" : "Purchase directly from tribal farmers"}
                    </p>
                </div>

                {/* Seller Card */}
                <div 
                    onClick={() => confirmRole('seller')}
                    className={`
                    flex flex-col items-center justify-center p-8 rounded-3xl border-2 transition-all duration-300 cursor-pointer hover:scale-[1.02] shadow-sm
                    ${selectedRole === 'seller' 
                        ? 'bg-emerald-50 border-emerald-500 shadow-md' 
                        : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md'}
                    ${selectedRole && selectedRole !== 'seller' ? 'opacity-30 pointer-events-none' : ''}
                `}>
                    <div className="text-7xl mb-4 drop-shadow-sm">🌾</div>
                    <div className="text-2xl font-black text-emerald-700">
                        {t.sellerUI || "விற்பனையாளர்"}
                    </div>
                    <div className="text-slate-600 mt-2 text-sm">(Seller / Producer)</div>
                    <p className="text-slate-600 text-xs mt-3 text-center">
                        {language === 'ta-IN' ? "உங்கள் இயற்கை விளைபொருட்களை விற்க" : "Sell honey, turmeric & forest produce"}
                    </p>
                </div>
            </div>
        </div>
    );
};

