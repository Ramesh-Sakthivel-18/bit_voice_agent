import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseIntent } from '../services/api';
import { getTranslation } from '../utils/translations';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { 
    normalizeText, 
    extractDigitsFromVoice, 
    isAffirmativeIntent, 
    isDeleteDigitIntent, 
    isClearAllDigitsIntent 
} from '../utils/voiceMatcher';

const POPULAR_VILLAGES = [
    { title: "Nilgiris", local: "நீலகிரி" },
    { title: "Kotagiri", local: "கோத்தகிரி" },
    { title: "Valparai", local: "வால்பாறை" },
    { title: "Kolli Hills", local: "கொல்லிமலை" },
    { title: "Anaikatti", local: "ஆனைக்கட்டி" },
    { title: "Yercaud", local: "ஏற்காடு" }
];

export const VoiceOnboarding = ({ language, userData, onComplete }) => {
    const { 
        setPageContext, 
        setScreenInstruction, 
        setGuidePrompt, 
        speak, 
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    // Mode: 'wizard' (Step-by-Step) | 'form' (Full Form Typing View)
    const [inputMode, setInputMode] = useState('wizard');
    const [step, setStep] = useState(0); // 0: Name, 1: Village, 2: Phone
    const [statusFeedback, setStatusFeedback] = useState('');
    const [localData, setLocalData] = useState({ 
        name: userData?.name || '', 
        village: userData?.village || '', 
        phone: userData?.phone || '' 
    });
    const [phoneDigits, setPhoneDigits] = useState(userData?.phone || '');
    const [activeField, setActiveField] = useState('name');
    
    const localDataRef = useRef(localData);
    const phoneDigitsRef = useRef(phoneDigits);
    const unmounted = useRef(false);

    const t = getTranslation(language);

    const questions = [
        { 
            key: 'name', 
            prompt: t.namePrompt || (language === 'ta-IN' ? "உங்கள் பெயர் என்ன? சொல்லுங்கள் அல்லது தட்டச்சு செய்யவும்." : "What is your name? Please speak or type."), 
            entity: 'name', 
            title: t.nameUI || (language === 'ta-IN' ? "பெயர்" : "Name"),
            placeholder: t.nameInputPlaceholder || (language === 'ta-IN' ? "உங்கள் பெயரை தட்டச்சு செய்யவும்..." : "Type your full name...")
        },
        { 
            key: 'village', 
            prompt: t.villagePrompt || (language === 'ta-IN' ? "நீங்கள் எந்த ஊர் அல்லது கிராமத்தில் வசிக்கிறீர்கள்? சொல்லுங்கள் அல்லது தட்டச்சு செய்யவும்." : "Which village or town do you live in? Speak or type."), 
            entity: 'village', 
            title: t.villageUI || (language === 'ta-IN' ? "கிராமம்" : "Village"),
            placeholder: t.villageInputPlaceholder || (language === 'ta-IN' ? "உங்கள் ஊர் அல்லது கிராமத்தை தட்டச்சு செய்யவும்..." : "Type your village or town...")
        },
        { 
            key: 'phone', 
            prompt: t.phoneNumPadPrompt || (language === 'ta-IN' ? "உங்கள் 10 இலக்க தொலைபேசி எண்ணை விசைப்பலகையில் தட்டவும் அல்லது பேசவும்." : "Type your 10-digit phone number or speak into the mic."), 
            entity: 'phone', 
            title: t.phoneUI || (language === 'ta-IN' ? "தொலைபேசி எண்" : "Phone"),
            placeholder: t.phoneInputPlaceholder || (language === 'ta-IN' ? "10 இலக்க தொலைபேசி எண்..." : "10-digit phone number...")
        }
    ];

    const currentQ = questions[step];

    // Subtle audio feedback for clicks
    const triggerKeyFeedback = () => {
        try {
            if (navigator?.vibrate) navigator.vibrate(20);
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(680, ctx.currentTime);
            gain.gain.setValueAtTime(0.06, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.04);
        } catch (e) {
            // AudioContext fallback
        }
    };

    // Keep refs in sync
    useEffect(() => {
        phoneDigitsRef.current = phoneDigits;
    }, [phoneDigits]);

    useEffect(() => {
        localDataRef.current = localData;
    }, [localData]);

    // Update screen voice context
    useEffect(() => {
        if (inputMode === 'form') {
            const pageCtx = language === 'ta-IN' ? "பதிவு: முழு படிவம் (Full Form)" : "Registration: Full Form";
            setPageContext(pageCtx);
            setScreenInstruction(language === 'ta-IN' ? "பெயர், கிராமம் மற்றும் தொலைபேசி எண்ணை தட்டச்சு செய்யவும் அல்லது பேசவும்." : "Type your details in the side form or speak into the bottom mic.", false);
            setGuidePrompt(language === 'ta-IN' ? "இடது பக்க படிவத்தை பூர்த்தி செய்து 'பதிவை முடி' அழுத்தவும்." : "Fill the side form and tap Complete Registration.");
            return;
        }

        if (!currentQ) return;

        let pageCtx = language === 'ta-IN' 
            ? `பதிவு: படி ${step + 1}/3 (${currentQ.title})` 
            : `Registration: Step ${step + 1}/3 (${currentQ.title})`;
        
        if (step === 2) {
            pageCtx = language === 'ta-IN'
                ? "படி 3/3: தொலைபேசி (குரல் + விசைப்பலகை)"
                : "Step 3/3: Phone Number (Voice + Keypad)";
        }
        setPageContext(pageCtx);

        const instruction = step === 2 
            ? (t.phoneNumPadPrompt || (language === 'ta-IN' ? "உங்கள் 10 இலக்க தொலைபேசி எண்ணை விசைப்பலகையில் தட்டவும் அல்லது பேசவும்." : "Type your 10-digit phone number or speak into the mic."))
            : currentQ.prompt;
        setScreenInstruction(instruction, true);

        const guide = step === 2
            ? (language === 'ta-IN'
                ? "வலது பக்க விசைப்பலகையில் எண்களை தட்டவும் அல்லது பேசவும்."
                : "Tap the right-side keypad or speak digits into the bottom mic.")
            : (language === 'ta-IN'
                ? "இடது பக்கத்தில் தட்டச்சு செய்யவும் அல்லது பேச கீழே உள்ள மைக்கை தட்டவும்."
                : "Type details in the side form or tap bottom mic to speak.");
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [step, inputMode, language, currentQ, setPageContext, setScreenInstruction, setGuidePrompt, t]);

    // Handle field text changes
    const handleFieldChange = (key, value) => {
        if (key === 'phone') {
            const cleanDigits = value.replace(/\D/g, '').slice(0, 10);
            setPhoneDigits(cleanDigits);
            setLocalData(prev => ({ ...prev, phone: cleanDigits }));
            setStatusFeedback(cleanDigits);
            return;
        }
        setLocalData(prev => ({ ...prev, [key]: value }));
    };

    // NumPad handlers
    const handleNumPadPress = (digit) => {
        triggerKeyFeedback();
        setPhoneDigits(prev => {
            if (prev.length >= 10) return prev;
            const next = prev + digit;
            localDataRef.current.phone = next;
            setLocalData(curr => ({ ...curr, phone: next }));
            setStatusFeedback(next);

            if (next.length === 10) {
                const prompt = language === 'ta-IN'
                    ? "10 இலக்கங்களும் பூர்த்தியாகின. உறுதிப்படுத்த பொத்தானை அழுத்தவும் அல்லது 'ஆம்' என்று சொல்லவும்."
                    : "10 digits entered. Tap confirm or say 'Yes'.";
                speak(prompt, language);
            }
            return next;
        });
    };

    const handleBackspace = () => {
        triggerKeyFeedback();
        setPhoneDigits(prev => {
            const next = prev.slice(0, -1);
            localDataRef.current.phone = next;
            setLocalData(curr => ({ ...curr, phone: next }));
            setStatusFeedback(next);
            return next;
        });
    };

    const handleClear = () => {
        triggerKeyFeedback();
        setPhoneDigits('');
        localDataRef.current.phone = '';
        setLocalData(curr => ({ ...curr, phone: '' }));
        setStatusFeedback('');
    };

    // Complete / Finalize Registration
    const handleConfirmRegistration = () => {
        triggerKeyFeedback();
        const current = localDataRef.current;
        const currentPhone = phoneDigitsRef.current || current.phone;

        if (!current.name?.trim()) {
            const warnMsg = language === 'ta-IN' ? "தயவுசெய்து உங்கள் பெயரை உள்ளிடவும்." : "Please enter your name.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
            if (inputMode === 'wizard') setStep(0);
            return;
        }

        if (!current.village?.trim()) {
            const warnMsg = language === 'ta-IN' ? "தயவுசெய்து உங்கள் கிராமத்தை உள்ளிடவும்." : "Please enter your village.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
            if (inputMode === 'wizard') setStep(1);
            return;
        }

        if (currentPhone.length !== 10) {
            const warnMsg = language === 'ta-IN' 
                ? "தயவுசெய்து 10 இலக்க தொலைபேசி எண்ணையும் உள்ளிடவும்." 
                : "Please enter all 10 digits of your phone number.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
            if (inputMode === 'wizard') setStep(2);
            return;
        }

        const finalData = { ...current, phone: currentPhone };
        const doneMsg = language === 'ta-IN' 
            ? "பதிவு வெற்றிகரமாக முடிந்தது. முகப்பதிவுக்குச் செல்கிறது." 
            : "Registration completed. Moving to face enrollment.";
        setStatusFeedback(`✅ ${finalData.name} • ${finalData.village} • ${finalData.phone}`);
        speak(doneMsg, language);

        setTimeout(() => {
            if (unmounted.current) return;
            onComplete(finalData);
        }, 1100);
    };

    // Step 0 & 1 voice processor
    const processVoiceAnswer = useCallback(async (spokenText, currentStep) => {
        if (!spokenText || unmounted.current) return;
        const q = questions[currentStep];
        if (!q) return;

        setStatusFeedback(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Processing...');

        try {
            const intentRes = await parseIntent(spokenText, q.entity);
            const extracted = intentRes.extracted_value;

            localDataRef.current[q.key] = extracted;
            setLocalData({ ...localDataRef.current });

            const prefix = language === 'ta-IN' ? `நான் கேட்டது: ${extracted}` : `Recorded: ${extracted}`;
            setStatusFeedback(`✅ ${prefix}`);
            speak(prefix, language);

            setTimeout(() => {
                if (unmounted.current) return;
                if (currentStep < 2) {
                    setStep(currentStep + 1);
                } else {
                    handleConfirmRegistration();
                }
            }, 1400);

        } catch (err) {
            console.error("Onboarding voice error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. தயவுசெய்து மீண்டும் கூறவும் அல்லது தட்டச்சு செய்யவும்." : "I didn't catch that. Please repeat or type.";
            setStatusFeedback(errorMsg);
            speak(errorMsg, language);
        }
    }, [language, questions, speak]);

    // Register active voice command handler
    useEffect(() => {
        const handleVoiceInput = async (rawText) => {
            if (!rawText) return;
            const text = normalizeText(rawText);
            console.log(`[Onboarding Voice Input]:`, text);

            if (step === 2 || inputMode === 'form') {
                const currentDigits = phoneDigitsRef.current;

                if (currentDigits.length === 10 && isAffirmativeIntent(text)) {
                    handleConfirmRegistration();
                    return;
                }

                if (isDeleteDigitIntent(text)) {
                    handleBackspace();
                    return;
                }

                if (isClearAllDigitsIntent(text)) {
                    handleClear();
                    return;
                }

                const spokenDigits = extractDigitsFromVoice(rawText);
                if (spokenDigits && spokenDigits.length > 0) {
                    if (spokenDigits.length === 10) {
                        setPhoneDigits(spokenDigits);
                        localDataRef.current.phone = spokenDigits;
                        setLocalData(curr => ({ ...curr, phone: spokenDigits }));
                        setStatusFeedback(`✅ ${spokenDigits}`);
                        const confirmPrompt = language === 'ta-IN'
                            ? `கேட்டது ${spokenDigits}. உறுதிப்படுத்த 'ஆம்' அல்லது பொத்தானை அழுத்தவும்.`
                            : `Recorded ${spokenDigits}. Say 'Yes' or tap Confirm to proceed.`;
                        speak(confirmPrompt, language);
                        return;
                    } else {
                        setPhoneDigits(prev => {
                            const combined = (prev + spokenDigits).slice(0, 10);
                            localDataRef.current.phone = combined;
                            setLocalData(curr => ({ ...curr, phone: combined }));
                            setStatusFeedback(combined);
                            if (combined.length === 10) {
                                const confirmPrompt = language === 'ta-IN'
                                    ? `10 இலக்கங்கள் உள்ளிடப்பட்டன. உறுதிப்படுத்த 'ஆம்' என்று சொல்லவும்.`
                                    : `10 digits entered. Say 'Yes' or tap Confirm.`;
                                speak(confirmPrompt, language);
                            }
                            return combined;
                        });
                        return;
                    }
                }
            }

            processVoiceAnswer(rawText, step);
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
        };
    }, [step, inputMode, registerVoiceHandler, unregisterVoiceHandler, processVoiceAnswer, language, speak]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    const NUMPAD_ROWS = [
        ['1', '2', '3'],
        ['4', '5', '6'],
        ['7', '8', '9']
    ];

    const isFormValid = Boolean(localData.name?.trim() && localData.village?.trim() && phoneDigits.length === 10);

    return (
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 md:py-4 pb-60">
            
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TOP BAR: MODE SWITCH & RECORDED STATUS CHIPS                   */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <header className="w-full flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800">
                <div className="text-left w-full md:w-auto">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 bg-cyan-950/80 px-3 py-1 rounded-full border border-cyan-700/60 shadow-sm">
                            {inputMode === 'wizard' 
                                ? (language === 'ta-IN' ? `படிநிலை ${step + 1} / 3` : `Step ${step + 1} of 3`)
                                : (language === 'ta-IN' ? "முழு பதிவு படிவம்" : "Full Registration Form")}
                        </span>
                        <span className="text-[11px] font-bold text-amber-300 bg-amber-950/80 px-2.5 py-1 rounded-full border border-amber-600/60 shadow-sm">
                            {t.dualVoiceKeypadBadge || (language === 'ta-IN' ? "🎙️ குரல் + ⌨️ தட்டச்சு + 🔢 விசைப்பலகை" : "🎙️ Voice + ⌨️ Typing + 🔢 Keypad")}
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-white">
                        {language === 'ta-IN' ? "உறுப்பினர் நேரடி பதிவு" : "Member Voice & Typing Registration"}
                    </h1>
                </div>

                {/* Mode Switch Pills */}
                <div className="flex bg-[#071329] p-1.5 rounded-2xl border border-slate-700/90 shadow-lg w-full md:w-auto">
                    <button
                        type="button"
                        onClick={() => setInputMode('wizard')}
                        className={`flex-1 md:flex-initial py-2.5 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            inputMode === 'wizard'
                                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>🎙️</span>
                        <span>{t.stepModeTab || (language === 'ta-IN' ? "படிநிலை பதிவு (Wizard)" : "Step Wizard")}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setInputMode('form')}
                        className={`flex-1 md:flex-initial py-2.5 px-4 rounded-xl font-black text-xs md:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            inputMode === 'form'
                                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                                : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        <span>⌨️</span>
                        <span>{t.formModeTab || (language === 'ta-IN' ? "முழு படிவம் (Full Form)" : "Full Form")}</span>
                    </button>
                </div>
            </header>

            {/* Quick Status Chips Bar */}
            <div className="w-full grid grid-cols-3 gap-2.5 md:gap-4 mb-6">
                {questions.map((q, idx) => (
                    <button 
                        key={q.key}
                        type="button"
                        onClick={() => {
                            if (inputMode === 'wizard') {
                                setStep(idx);
                            } else {
                                setActiveField(q.key);
                            }
                        }}
                        className={`p-3 md:p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                            (inputMode === 'wizard' && idx === step) || (inputMode === 'form' && activeField === q.key)
                                ? 'bg-[#0E2042] border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.35)] ring-2 ring-cyan-500/30' 
                                : localData[q.key]
                                ? 'bg-emerald-950/30 border-emerald-500/60 hover:border-emerald-400' 
                                : 'bg-[#071329]/70 border-slate-800 hover:border-slate-700'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-[11px] text-gray-400 font-bold uppercase">{q.title}</p>
                            {localData[q.key] ? (
                                <span className="text-xs text-emerald-400 font-bold">✓</span>
                            ) : (
                                <span className="text-[10px] text-slate-500">{idx + 1}/3</span>
                            )}
                        </div>
                        <p className="text-white font-black text-sm md:text-base truncate mt-0.5">
                            {idx === 2 ? (phoneDigits || localData.phone || '---') : (localData[q.key] || '---')}
                        </p>
                    </button>
                ))}
            </div>

            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* TWO-COLUMN SIDE-BY-SIDE LAYOUT (THE FORM ON THE SIDE!)          */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-10 xl:gap-14 items-start">
                
                {/* ───────────────────────────────────────────────────────────── */}
                {/* LEFT SIDE: THE FORM (GUARANTEED AWAY FROM THE CENTER MIC DOCK) */}
                {/* ───────────────────────────────────────────────────────────── */}
                <div className="w-full flex flex-col lg:pr-4">
                    
                    {/* OPTION 1: FULL FORM TYPING VIEW */}
                    {inputMode === 'form' ? (
                        <div className="w-full bg-[#091733]/95 border-2 border-slate-700/80 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col space-y-5">
                            
                            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                                        <span>📝</span>
                                        <span>{language === 'ta-IN' ? "உறுப்பினர் பதிவு படிவம்" : "Member Registration Form"}</span>
                                    </h2>
                                    <p className="text-xs md:text-sm text-cyan-300 font-semibold mt-0.5">
                                        {language === 'ta-IN' ? "இங்கு தட்டச்சு செய்யவும் அல்லது கீழே உள்ள மைக்கில் பேசவும்" : "Type in these fields or speak into the bottom mic"}
                                    </p>
                                </div>
                                <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-700 px-3 py-1 rounded-full">
                                    {isFormValid ? "✓ தயார் / Ready" : "3 விவரங்கள் / 3 Fields"}
                                </span>
                            </div>

                            {/* Field 1: Name */}
                            <div className="w-full text-left">
                                <label className="block text-xs font-black uppercase text-cyan-300 tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>👤 {t.nameUI || (language === 'ta-IN' ? "பெயர்" : "Name")}</span>
                                    <span className="text-[11px] text-gray-400 font-normal lowercase">({language === 'ta-IN' ? "கட்டாயம்" : "required"})</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={localData.name}
                                        onFocus={() => setActiveField('name')}
                                        onChange={(e) => handleFieldChange('name', e.target.value)}
                                        placeholder={t.nameInputPlaceholder || (language === 'ta-IN' ? "உங்கள் பெயரை தட்டச்சு செய்யவும்..." : "Type your full name...")}
                                        className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 text-base md:text-lg outline-none transition-all pr-10 shadow-inner"
                                    />
                                    {localData.name && (
                                        <button
                                            type="button"
                                            onClick={() => handleFieldChange('name', '')}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            title="Clear"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Field 2: Village */}
                            <div className="w-full text-left">
                                <label className="block text-xs font-black uppercase text-cyan-300 tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>📍 {t.villageUI || (language === 'ta-IN' ? "கிராமம் / ஊர்" : "Village / Town")}</span>
                                    <span className="text-[11px] text-gray-400 font-normal lowercase">({language === 'ta-IN' ? "கட்டாயம்" : "required"})</span>
                                </label>
                                <div className="relative mb-2">
                                    <input
                                        type="text"
                                        value={localData.village}
                                        onFocus={() => setActiveField('village')}
                                        onChange={(e) => handleFieldChange('village', e.target.value)}
                                        placeholder={t.villageInputPlaceholder || (language === 'ta-IN' ? "உங்கள் ஊர் அல்லது கிராமத்தை தட்டச்சு செய்யவும்..." : "Type your village or town...")}
                                        className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 text-base md:text-lg outline-none transition-all pr-10 shadow-inner"
                                    />
                                    {localData.village && (
                                        <button
                                            type="button"
                                            onClick={() => handleFieldChange('village', '')}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            title="Clear"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Quick Village Chips */}
                                <div className="flex flex-wrap gap-1.5 items-center mt-1">
                                    <span className="text-[11px] text-gray-400 font-bold">{t.popularVillagesTitle || "பரிந்துரைகள்:"}</span>
                                    {POPULAR_VILLAGES.map((v) => (
                                        <button
                                            key={v.title}
                                            type="button"
                                            onClick={() => handleFieldChange('village', language === 'ta-IN' ? v.local : v.title)}
                                            className="px-2.5 py-1 bg-slate-800/80 hover:bg-cyan-900/60 hover:border-cyan-400 text-cyan-200 border border-slate-700 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                                        >
                                            {language === 'ta-IN' ? v.local : v.title}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Field 3: Phone */}
                            <div className="w-full text-left">
                                <label className="block text-xs font-black uppercase text-cyan-300 tracking-wider mb-1.5 flex items-center justify-between">
                                    <span>📞 {t.phoneUI || (language === 'ta-IN' ? "தொலைபேசி எண் (10 இலக்கங்கள்)" : "Phone Number (10 digits)")}</span>
                                    <span className="text-xs font-mono font-bold text-amber-400">
                                        {phoneDigits.length === 10 ? "✓ 10/10" : `${phoneDigits.length} / 10`}
                                    </span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-base">
                                        🇮🇳 +91
                                    </span>
                                    <input
                                        type="tel"
                                        maxLength={10}
                                        value={phoneDigits}
                                        onFocus={() => setActiveField('phone')}
                                        onChange={(e) => handleFieldChange('phone', e.target.value)}
                                        placeholder="9876543210"
                                        className="w-full pl-20 pr-10 py-4 bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-mono font-black rounded-2xl text-xl outline-none tracking-wider transition-all shadow-inner"
                                    />
                                    {phoneDigits && (
                                        <button
                                            type="button"
                                            onClick={handleClear}
                                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            title="Clear"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-400 font-semibold mt-1.5 flex items-center gap-1">
                                    <span>💡</span>
                                    <span>{language === 'ta-IN' ? "வலது பக்கத்தில் உள்ள பெரிய விசைப்பலகையையும் பயன்படுத்தலாம்" : "You can also tap the large numpad on the right"}</span>
                                </p>
                            </div>

                            {/* Primary Action Button (Located strictly on the Left Side!) */}
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={handleConfirmRegistration}
                                    className={`w-full py-4 md:py-5 rounded-2xl font-black text-lg md:text-xl shadow-xl transition-all flex items-center justify-center gap-3 cursor-pointer ${
                                        isFormValid
                                            ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_0_30px_rgba(16,185,129,0.5)] transform hover:scale-[1.01] active:scale-[0.99]'
                                            : 'bg-slate-800 text-gray-400 border border-slate-700 hover:bg-slate-700/80 hover:text-white'
                                    }`}
                                >
                                    <span>✓</span>
                                    <span>{t.completeRegistrationBtn || (language === 'ta-IN' ? "பதிவை முடி (அடுத்த படி)" : "Complete Registration")}</span>
                                </button>
                            </div>

                        </div>
                    ) : (
                        /* OPTION 2: STEP-BY-STEP WIZARD (STRICTLY ON THE LEFT SIDE!) */
                        <div className="w-full bg-[#091733]/95 border-2 border-cyan-500/40 rounded-3xl p-5 sm:p-7 shadow-2xl flex flex-col space-y-5">
                            
                            {/* Step Header */}
                            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                                        {language === 'ta-IN' ? `படிநிலை ${step + 1} / 3` : `Step ${step + 1} of 3`}
                                    </span>
                                    <h2 className="text-2xl md:text-3xl font-black text-white mt-0.5">
                                        {currentQ.title}
                                    </h2>
                                </div>
                                {/* Step dots */}
                                <div className="flex gap-2">
                                    {[0, 1, 2].map((idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setStep(idx)}
                                            className={`h-2.5 rounded-full transition-all cursor-pointer ${
                                                idx === step 
                                                    ? 'w-8 bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.8)]' 
                                                    : idx < step 
                                                    ? 'w-2.5 bg-emerald-500' 
                                                    : 'w-2.5 bg-slate-700'
                                            }`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <p className="text-cyan-200 text-base md:text-lg font-bold">
                                {currentQ.prompt}
                            </p>

                            {/* ─── STEP 0: NAME ─── */}
                            {step === 0 && (
                                <div className="w-full space-y-4">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={localData.name}
                                            onChange={(e) => handleFieldChange('name', e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && localData.name.trim()) setStep(1);
                                            }}
                                            placeholder={t.nameInputPlaceholder || (language === 'ta-IN' ? "உங்கள் பெயரை தட்டச்சு செய்யவும்..." : "Type your full name...")}
                                            className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 md:p-5 text-lg md:text-xl outline-none transition-all shadow-inner pr-12"
                                        />
                                        {localData.name && (
                                            <button
                                                type="button"
                                                onClick={() => handleFieldChange('name', '')}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center gap-2">
                                        <span className="text-amber-400 text-lg">💡</span>
                                        <p className="text-xs text-amber-200/90 font-medium">
                                            {language === 'ta-IN' ? "தட்டச்சு செய்யலாம் அல்லது கீழே உள்ள மைக்கை தட்டி உங்கள் பெயரை கூறலாம்." : "Type your name above or tap the bottom mic to speak."}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (localData.name.trim()) setStep(1);
                                        }}
                                        disabled={!localData.name?.trim()}
                                        className={`w-full py-4 rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                            localData.name?.trim()
                                                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg'
                                                : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                        }`}
                                    >
                                        <span>{t.nextStepBtn || (language === 'ta-IN' ? "அடுத்த படி ➔" : "Next Step ➔")}</span>
                                    </button>
                                </div>
                            )}

                            {/* ─── STEP 1: VILLAGE ─── */}
                            {step === 1 && (
                                <div className="w-full space-y-4">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={localData.village}
                                            onChange={(e) => handleFieldChange('village', e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && localData.village.trim()) setStep(2);
                                            }}
                                            placeholder={t.villageInputPlaceholder || (language === 'ta-IN' ? "உங்கள் ஊர் அல்லது கிராமத்தை தட்டச்சு செய்யவும்..." : "Type your village or town...")}
                                            className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 md:p-5 text-lg md:text-xl outline-none transition-all shadow-inner pr-12"
                                        />
                                        {localData.village && (
                                            <button
                                                type="button"
                                                onClick={() => handleFieldChange('village', '')}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    {/* Village Chips */}
                                    <div className="w-full text-left">
                                        <p className="text-xs text-gray-400 font-bold mb-2">
                                            {t.popularVillagesTitle || (language === 'ta-IN' ? "பிரபலமான பகுதிகள்:" : "Popular Hubs:")}
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {POPULAR_VILLAGES.map((v) => (
                                                <button
                                                    key={v.title}
                                                    type="button"
                                                    onClick={() => handleFieldChange('village', language === 'ta-IN' ? v.local : v.title)}
                                                    className="px-3 py-1.5 bg-slate-800/90 hover:bg-cyan-900/60 hover:border-cyan-400 text-cyan-200 border border-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                                >
                                                    {language === 'ta-IN' ? v.local : v.title}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Back and Next */}
                                    <div className="w-full grid grid-cols-2 gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(0)}
                                            className="py-4 rounded-2xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
                                        >
                                            {t.prevStepBtn || (language === 'ta-IN' ? "⬅ பின்" : "⬅ Back")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (localData.village.trim()) setStep(2);
                                            }}
                                            disabled={!localData.village?.trim()}
                                            className={`py-4 rounded-2xl font-black text-lg transition-all cursor-pointer ${
                                                localData.village?.trim()
                                                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg'
                                                    : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                            }`}
                                        >
                                            {t.nextStepBtn || (language === 'ta-IN' ? "அடுத்த படி ➔" : "Next Step ➔")}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* ─── STEP 2: PHONE ─── */}
                            {step === 2 && (
                                <div className="w-full space-y-4">
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400 text-base">
                                            🇮🇳 +91
                                        </span>
                                        <input
                                            type="tel"
                                            maxLength={10}
                                            autoFocus
                                            value={phoneDigits}
                                            onChange={(e) => handleFieldChange('phone', e.target.value)}
                                            placeholder="9876543210"
                                            className="w-full pl-20 pr-12 py-4 md:py-5 bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-mono font-black rounded-2xl text-xl outline-none tracking-wider transition-all shadow-inner"
                                        />
                                        {phoneDigits && (
                                            <button
                                                type="button"
                                                onClick={handleClear}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                                        <span className="text-xs text-gray-300 font-semibold">
                                            {language === 'ta-IN' ? "வலது பக்க விசைப்பலகையில் தட்டவும் அல்லது கீழே பேசவும்" : "Tap keypad on the right or speak into the bottom mic"}
                                        </span>
                                        <span className="text-xs font-mono font-black text-cyan-400">
                                            {phoneDigits.length} / 10
                                        </span>
                                    </div>

                                    <div className="w-full grid grid-cols-3 gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setStep(1)}
                                            className="py-4 rounded-2xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer"
                                        >
                                            {t.prevStepBtn || (language === 'ta-IN' ? "⬅ பின்" : "⬅ Back")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmRegistration}
                                            disabled={phoneDigits.length !== 10}
                                            className={`col-span-2 py-4 rounded-2xl font-black text-base md:text-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                                phoneDigits.length === 10
                                                    ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_0_25px_rgba(16,185,129,0.7)] animate-pulse'
                                                    : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                            }`}
                                        >
                                            <span>✓</span>
                                            <span>
                                                {phoneDigits.length === 10
                                                    ? (t.confirmPhoneBtn || (language === 'ta-IN' ? "உறுதிப்படுத்து" : "Confirm"))
                                                    : `${phoneDigits.length}/10`}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                </div>

                {/* ───────────────────────────────────────────────────────────── */}
                {/* RIGHT SIDE: THE COMPANION PANEL (NUMPAD + VOICE ASSISTANT)     */}
                {/* ───────────────────────────────────────────────────────────── */}
                <div className="w-full flex flex-col space-y-5 lg:pl-4">
                    
                    {/* Visual 10-Slot Digit Indicator */}
                    <div className="w-full bg-[#07142A]/95 border-2 border-cyan-500/40 rounded-3xl p-4 md:p-5 shadow-2xl flex flex-col items-center">
                        <div className="w-full flex justify-between items-center mb-2 px-1">
                            <span className="text-xs font-extrabold text-cyan-300 bg-cyan-950/80 px-2.5 py-1 rounded-full border border-cyan-700 flex items-center gap-1.5">
                                <span>🇮🇳</span>
                                <span>+91</span>
                            </span>

                            {phoneDigits.length === 10 ? (
                                <span className="bg-emerald-950 text-emerald-300 text-xs font-black px-3 py-1 rounded-full border border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] animate-pulse flex items-center gap-1">
                                    <span>✓</span>
                                    <span>{t.phoneCompletedBadge || (language === 'ta-IN' ? "10/10 பூர்த்தி" : "10/10 Done")}</span>
                                </span>
                            ) : (
                                <span className="text-xs font-bold text-gray-400">
                                    <strong className="text-cyan-400 font-mono text-sm">{phoneDigits.length}</strong> / 10 {t.phoneDigitsCount || (language === 'ta-IN' ? "இலக்கங்கள்" : "digits")}
                                </span>
                            )}
                        </div>

                        {/* 10 Visual Digit Slots in Two Groups of 5 */}
                        <div className="flex items-center justify-center gap-1 md:gap-1.5 my-1.5 w-full">
                            <div className="flex gap-1 md:gap-1.5">
                                {[0, 1, 2, 3, 4].map((slotIdx) => {
                                    const digit = phoneDigits[slotIdx];
                                    const isActive = phoneDigits.length === slotIdx;
                                    const isComplete = phoneDigits.length === 10;
                                    return (
                                        <div
                                            key={slotIdx}
                                            className={`w-7 h-11 md:w-9 md:h-13 rounded-xl flex items-center justify-center text-lg md:text-2xl font-black font-mono transition-all ${
                                                digit
                                                    ? isComplete
                                                        ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                                        : 'bg-cyan-950/80 border-2 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                                                    : isActive
                                                    ? 'bg-slate-900 border-2 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse'
                                                    : 'bg-slate-900/60 border-2 border-slate-800 text-slate-600'
                                            }`}
                                        >
                                            {digit || (isActive ? '·' : '—')}
                                        </div>
                                    );
                                })}
                            </div>

                            <span className="text-slate-600 font-bold text-lg md:text-xl px-0.5">-</span>

                            <div className="flex gap-1 md:gap-1.5">
                                {[5, 6, 7, 8, 9].map((slotIdx) => {
                                    const digit = phoneDigits[slotIdx];
                                    const isActive = phoneDigits.length === slotIdx;
                                    const isComplete = phoneDigits.length === 10;
                                    return (
                                        <div
                                            key={slotIdx}
                                            className={`w-7 h-11 md:w-9 md:h-13 rounded-xl flex items-center justify-center text-lg md:text-2xl font-black font-mono transition-all ${
                                                digit
                                                    ? isComplete
                                                        ? 'bg-emerald-950/80 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.5)]'
                                                        : 'bg-cyan-950/80 border-2 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                                                    : isActive
                                                    ? 'bg-slate-900 border-2 border-amber-400 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.6)] animate-pulse'
                                                    : 'bg-slate-900/60 border-2 border-slate-800 text-slate-600'
                                            }`}
                                        >
                                            {digit || (isActive ? '·' : '—')}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* THE BIGGEST NUM PAD ON SCREEN */}
                    <div className="w-full bg-[#07142A]/95 border-2 border-slate-700/80 rounded-3xl p-4 md:p-5 shadow-2xl">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <span className="text-xs font-black uppercase text-amber-300 tracking-wider">
                                🔢 {language === 'ta-IN' ? "பெரிய எண் விசைப்பலகை" : "Big Number Keypad"}
                            </span>
                            <span className="text-[11px] text-gray-400 font-semibold">
                                {language === 'ta-IN' ? "தட்டவும் அல்லது பேசவும்" : "Touch or speak"}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2.5 md:gap-3">
                            {NUMPAD_ROWS.map((row, rIdx) => (
                                <React.Fragment key={rIdx}>
                                    {row.map((num) => (
                                        <button
                                            key={num}
                                            type="button"
                                            onClick={() => handleNumPadPress(num)}
                                            className="h-14 md:h-16 rounded-2xl bg-gradient-to-b from-[#102447] to-[#0A162B] hover:from-[#173466] hover:to-[#0F203E] active:scale-95 border-2 border-slate-700/80 hover:border-cyan-400 active:border-cyan-300 text-white shadow-lg flex items-center justify-center transition-all cursor-pointer select-none group"
                                        >
                                            <span className="text-2xl md:text-3xl font-black font-mono group-hover:scale-110 transition-transform">
                                                {num}
                                            </span>
                                        </button>
                                    ))}
                                </React.Fragment>
                            ))}

                            {/* Row 4: Backspace | 0 | Clear */}
                            <button
                                type="button"
                                onClick={handleBackspace}
                                className="h-14 md:h-16 rounded-2xl bg-rose-950/40 hover:bg-rose-900/60 active:scale-95 border-2 border-rose-800/60 hover:border-rose-400 text-rose-300 shadow-lg flex flex-col items-center justify-center transition-all cursor-pointer select-none"
                                title="Delete last digit"
                            >
                                <span className="text-xl md:text-2xl font-black">⌫</span>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                                    {t.deleteDigitBtn || (language === 'ta-IN' ? "அழி" : "Del")}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleNumPadPress('0')}
                                className="h-14 md:h-16 rounded-2xl bg-gradient-to-b from-[#102447] to-[#0A162B] hover:from-[#173466] hover:to-[#0F203E] active:scale-95 border-2 border-slate-700/80 hover:border-cyan-400 active:border-cyan-300 text-white shadow-lg flex items-center justify-center transition-all cursor-pointer select-none group"
                            >
                                <span className="text-2xl md:text-3xl font-black font-mono group-hover:scale-110 transition-transform">
                                    0
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={handleClear}
                                className="h-14 md:h-16 rounded-2xl bg-amber-950/40 hover:bg-amber-900/60 active:scale-95 border-2 border-amber-800/60 hover:border-amber-400 text-amber-300 shadow-lg flex flex-col items-center justify-center transition-all cursor-pointer select-none"
                                title="Clear all digits"
                            >
                                <span className="text-xl md:text-2xl font-black">✕</span>
                                <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                                    {t.clearAllBtn || (language === 'ta-IN' ? "நீக்கு" : "Clear")}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Live Voice Assistant Feedback Card */}
                    <div className="w-full bg-[#071329]/90 border border-slate-700/70 rounded-2xl p-4 shadow-xl text-left">
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
                            <span className="text-xs font-black uppercase text-cyan-300 tracking-wider">
                                🎙️ {language === 'ta-IN' ? "குரல் வழிகாட்டி" : "Voice Guide"}
                            </span>
                        </div>
                        <p className="text-xs md:text-sm text-gray-300 font-medium">
                            {statusFeedback || (language === 'ta-IN' ? "நீங்கள் பேசலாம் அல்லது தட்டச்சு செய்யலாம். கீழே உள்ள மைக்கை தட்டி எண்களை நேரடியாக கூறவும்." : "You can type or speak. Tap the bottom mic to say your name, village, or digits directly.")}
                        </p>
                    </div>

                </div>

            </div>

        </div>
    );
};
