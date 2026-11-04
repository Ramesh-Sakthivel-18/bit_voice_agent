import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseIntent } from '../services/api';
import { getTranslation } from '../utils/translations';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { 
    normalizeText, 
    isVoiceMethodIntent,
    isTypeMethodIntent
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

    // Method selection: null (choose upfront), 'voice', or 'type'
    const [method, setMethod] = useState(null);
    // Step: 0 = Name, 1 = Village, 2 = Phone
    const [step, setStep] = useState(0);

    const [localData, setLocalData] = useState({ 
        name: userData?.name || '', 
        village: userData?.village || '', 
        phone: userData?.phone || '' 
    });
    const [phoneDigits, setPhoneDigits] = useState(userData?.phone || '');
    const [statusFeedback, setStatusFeedback] = useState('');
    
    const localDataRef = useRef(localData);
    const phoneDigitsRef = useRef(phoneDigits);
    const lastAnnouncedRef = useRef('');
    const unmounted = useRef(false);

    const t = getTranslation(language);

    // Subtle audio feedback for numpad taps
    const triggerKeyFeedback = () => {
        try {
            if (navigator?.vibrate) navigator.vibrate(15);
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(720, ctx.currentTime);
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.035);
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

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    // ─── ANNOUNCEMENT & VOICE CONTEXT CONTROLLER (SPEAKS STRICTLY ONCE PER STEP) ───
    useEffect(() => {
        let screenKey = '';
        let pageCtx = '';
        let instruction = '';
        let guide = '';

        if (method === null) {
            screenKey = 'method_selection';
            pageCtx = language === 'ta-IN' ? "பதிவு முறை தேர்வு" : "Choose Registration Method";
            instruction = language === 'ta-IN' 
                ? "பதிவு செய்ய குரல் வழி அல்லது தட்டச்சு வழியைத் தேர்ந்தெடுக்கவும். சொல்லுங்கள் அல்லது தொடவும்."
                : "Choose Voice or Typing method to register. Speak or select an option.";
            guide = language === 'ta-IN'
                ? "குரல் அல்லது தட்டச்சு அட்டையைத் தொடவும்."
                : "Tap Voice or Typing card to continue.";
        } else if (step === 0) {
            screenKey = `step_0_${method}`;
            pageCtx = language === 'ta-IN' ? "படிநிலை 1/3: பெயர்" : "Step 1/3: Name";
            instruction = language === 'ta-IN'
                ? "உங்கள் பெயர் என்ன? சொல்லுங்கள் அல்லது தட்டச்சு செய்யவும்."
                : "What is your name? Please speak or type.";
            guide = method === 'voice'
                ? (language === 'ta-IN' ? "கீழே உள்ள மைக்கை 2-முறை தட்டி உங்கள் பெயரை கூறவும்." : "Double-tap bottom mic and say your name.")
                : (language === 'ta-IN' ? "பெயரை தட்டச்சு செய்து 'அடுத்த படி' அழுத்தவும்." : "Type your name and tap Next Step.");
        } else if (step === 1) {
            screenKey = `step_1_${method}`;
            pageCtx = language === 'ta-IN' ? "படிநிலை 2/3: கிராமம்" : "Step 2/3: Village";
            instruction = language === 'ta-IN'
                ? "நீங்கள் எந்த ஊர் அல்லது கிராமத்தில் வசிக்கிறீர்கள்? சொல்லுங்கள் அல்லது தேர்ந்தெடுக்கவும்."
                : "Which village or town do you live in? Speak or select.";
            guide = method === 'voice'
                ? (language === 'ta-IN' ? "மைக்கை 2-முறை தட்டி ஊரைக் கூறவும் அல்லது பரிந்துரையைத் தொடவும்." : "Double-tap mic to speak village or tap a recommendation.")
                : (language === 'ta-IN' ? "கிராமத்தை தட்டச்சு செய்யவும் அல்லது பரிந்துரையைத் தொடவும்." : "Type village name or tap a recommendation.");
        } else if (step === 2) {
            screenKey = `step_2_${method}`;
            pageCtx = language === 'ta-IN' ? "படிநிலை 3/3: தொலைபேசி எண்" : "Step 3/3: Phone Number";
            // KEYPAD ONLY - STRICTLY NO VOICE
            instruction = language === 'ta-IN'
                ? "உங்கள் 10 இலக்க தொலைபேசி எண்ணை விசைப்பலகையில் தட்டவும்."
                : "Please type your 10-digit phone number using the keypad.";
            guide = language === 'ta-IN'
                ? "கீழே உள்ள எண் விசைப்பலகையில் எண்களைத் தட்டவும்."
                : "Tap digits on the keypad below.";
        }

        setPageContext(pageCtx);
        setScreenInstruction(instruction, false);
        setGuidePrompt(guide);

        // Speak ONLY ONCE when entering a new screen/step
        if (lastAnnouncedRef.current !== screenKey) {
            lastAnnouncedRef.current = screenKey;
            speak(instruction, language);
        }
    }, [method, step, language, speak, setPageContext, setScreenInstruction, setGuidePrompt]);

    // ─── CHOOSE METHOD HANDLERS ───
    const selectMethod = (chosen) => {
        triggerKeyFeedback();
        setMethod(chosen);
        setStep(0);
        setStatusFeedback(chosen === 'voice' 
            ? (language === 'ta-IN' ? "🎙️ குரல் வழி தேர்வு செய்யப்பட்டது" : "🎙️ Voice method selected")
            : (language === 'ta-IN' ? "⌨️ தட்டச்சு வழி தேர்வு செய்யப்பட்டது" : "⌨️ Typing method selected")
        );
    };

    // ─── NUMPAD HANDLERS (KEYPAD ONLY FOR PHONE STEP) ───
    const handleNumPadPress = (digit) => {
        triggerKeyFeedback();
        if (phoneDigits.length >= 10) return;
        const next = phoneDigits + digit;
        setPhoneDigits(next);
        localDataRef.current.phone = next;
        setLocalData(prev => ({ ...prev, phone: next }));

        if (next.length === 10) {
            const prompt = language === 'ta-IN'
                ? "10 இலக்கங்களும் பூர்த்தியாகின. உறுதிப்படுத்த பொத்தானை அழுத்தவும்."
                : "10 digits entered. Tap confirm to proceed.";
            speak(prompt, language);
        }
    };

    const handleBackspace = () => {
        triggerKeyFeedback();
        const next = phoneDigits.slice(0, -1);
        setPhoneDigits(next);
        localDataRef.current.phone = next;
        setLocalData(prev => ({ ...prev, phone: next }));
    };

    const handleClear = () => {
        triggerKeyFeedback();
        setPhoneDigits('');
        localDataRef.current.phone = '';
        setLocalData(prev => ({ ...prev, phone: '' }));
    };

    // ─── COMPLETE REGISTRATION ───
    const handleConfirmRegistration = () => {
        triggerKeyFeedback();
        const current = localDataRef.current;
        const currentPhone = phoneDigitsRef.current || current.phone;

        if (!current.name?.trim()) {
            const warnMsg = language === 'ta-IN' ? "தயவுசெய்து உங்கள் பெயரை உள்ளிடவும்." : "Please enter your name.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
            setStep(0);
            return;
        }

        if (!current.village?.trim()) {
            const warnMsg = language === 'ta-IN' ? "தயவுசெய்து உங்கள் கிராமத்தை உள்ளிடவும்." : "Please enter your village.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
            setStep(1);
            return;
        }

        if (currentPhone.length !== 10) {
            const warnMsg = language === 'ta-IN' 
                ? "தயவுசெய்து 10 இலக்க தொலைபேசி எண்ணையும் விசைப்பலகையில் தட்டவும்." 
                : "Please enter all 10 digits using the keypad.";
            setStatusFeedback(warnMsg);
            speak(warnMsg, language);
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

    // ─── VOICE INPUT PROCESSOR (STEPS 0 & 1 ONLY) ───
    const processVoiceAnswer = useCallback(async (spokenText, currentStep) => {
        if (!spokenText || unmounted.current) return;
        const entityKey = currentStep === 0 ? 'name' : 'village';

        setStatusFeedback(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Processing...');

        try {
            const intentRes = await parseIntent(spokenText, entityKey);
            const extracted = intentRes.extracted_value;

            if (!extracted) {
                const retryMsg = language === 'ta-IN' ? "தயவுசெய்து மீண்டும் தெளிவாகக் கூறவும்." : "Please say that again clearly.";
                setStatusFeedback(retryMsg);
                speak(retryMsg, language);
                return;
            }

            localDataRef.current[entityKey] = extracted;
            setLocalData(prev => ({ ...prev, [entityKey]: extracted }));

            const prefix = language === 'ta-IN' ? `நான் கேட்டது: ${extracted}` : `Recorded: ${extracted}`;
            setStatusFeedback(`✅ ${prefix}`);
            speak(prefix, language);

            setTimeout(() => {
                if (unmounted.current) return;
                if (currentStep === 0) {
                    setStep(1);
                } else if (currentStep === 1) {
                    setStep(2);
                }
            }, 1200);

        } catch (err) {
            console.error("Voice parse error:", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. தயவுசெய்து மீண்டும் கூறவும் அல்லது தட்டச்சு செய்யவும்." : "I didn't catch that. Please repeat or type.";
            setStatusFeedback(errorMsg);
            speak(errorMsg, language);
        }
    }, [language, speak]);

    // ─── ACTIVE VOICE COMMAND LISTENER ───
    useEffect(() => {
        const handleVoiceInput = async (rawText) => {
            if (!rawText) return;
            const text = normalizeText(rawText);
            console.log(`[Onboarding Voice Input]:`, text);

            // A. Upfront Method Selection by Voice
            if (method === null) {
                if (isVoiceMethodIntent(text)) {
                    selectMethod('voice');
                    return;
                }
                if (isTypeMethodIntent(text)) {
                    selectMethod('type');
                    return;
                }
                const hint = language === 'ta-IN' 
                    ? "'குரல்' அல்லது 'தட்டச்சு' என்று கூறவும்." 
                    : "Please say 'Voice' or 'Type'.";
                speak(hint, language);
                return;
            }

            // B. Phone Step: Strictly Keypad Only! (Per user requirement)
            if (step === 2) {
                const keypadOnlyReminder = language === 'ta-IN'
                    ? "தொலைபேசி எண்ணை கீழே உள்ள விசைப்பலகையில் மட்டும் தட்டவும்."
                    : "Please type your phone number using the keypad below.";
                setStatusFeedback(keypadOnlyReminder);
                speak(keypadOnlyReminder, language);
                return;
            }

            // C. Steps 0 (Name) & Step 1 (Village)
            processVoiceAnswer(rawText, step);
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
        };
    }, [method, step, registerVoiceHandler, unregisterVoiceHandler, processVoiceAnswer, language, speak]);

    return (
        <div className="w-full max-w-xl mx-auto px-4 py-2 flex flex-col items-center select-none">
            
            {/* ═══════════════════════════════════════════════════════════════ */}
            {/* SCREEN 0: UPFRONT METHOD SELECTION (VOICE vs TYPE)             */}
            {/* ═══════════════════════════════════════════════════════════════ */}
            {method === null ? (
                <div className="w-full bg-[#091733]/95 border-2 border-cyan-500/50 rounded-3xl p-6 sm:p-7 shadow-[0_0_40px_rgba(6,182,212,0.25)] flex flex-col items-center text-center animate-fadeIn">
                    
                    {/* Badge */}
                    <div className="flex items-center gap-2 mb-3">
                        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300 bg-cyan-950/90 px-3 py-1 rounded-full border border-cyan-600/70 shadow-sm">
                            {language === 'ta-IN' ? "உறுப்பினர் நேரடி பதிவு" : "Member Registration"}
                        </span>
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-black text-white mb-2">
                        {language === 'ta-IN' ? "பதிவு முறையைத் தேர்ந்தெடுக்கவும்" : "Choose Registration Method"}
                    </h1>
                    
                    <p className="text-sm sm:text-base text-cyan-200/90 font-medium mb-6">
                        {language === 'ta-IN' 
                            ? "நீங்கள் குரல் வழி அல்லது தட்டச்சு வழியைப் பயன்படுத்த விரும்புகிறீர்களா?" 
                            : "Would you like to use Voice or Typing to register?"}
                    </p>

                    {/* Method Choice Cards */}
                    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Option 1: Voice Method */}
                        <button
                            type="button"
                            onClick={() => selectMethod('voice')}
                            className="w-full p-5 rounded-2xl bg-gradient-to-b from-cyan-950/80 to-[#0c2447] border-2 border-cyan-400/80 hover:border-cyan-300 hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] transition-all flex flex-col items-center text-center group cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform shadow-inner">
                                🎙️
                            </div>
                            <span className="text-lg font-black text-white mb-1">
                                {language === 'ta-IN' ? "குரல் வழி" : "Voice Method"}
                            </span>
                            <span className="text-xs text-cyan-200 font-medium leading-relaxed mb-3">
                                {language === 'ta-IN' ? "மைக்கில் பேசி விவரங்களை எளிதாக உள்ளிடவும்" : "Speak your details naturally into the mic"}
                            </span>
                            <span className="text-[10px] font-black uppercase text-amber-300 bg-amber-950/80 border border-amber-500/80 px-2.5 py-0.5 rounded-full">
                                {language === 'ta-IN' ? "★ பரிந்துரைக்கப்படுகிறது" : "★ Recommended"}
                            </span>
                        </button>

                        {/* Option 2: Typing Method */}
                        <button
                            type="button"
                            onClick={() => selectMethod('type')}
                            className="w-full p-5 rounded-2xl bg-gradient-to-b from-slate-900/80 to-[#0e1d35] border-2 border-slate-700 hover:border-cyan-400 hover:shadow-[0_0_25px_rgba(6,182,212,0.3)] transition-all flex flex-col items-center text-center group cursor-pointer transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-600 flex items-center justify-center text-3xl mb-3 group-hover:scale-110 transition-transform shadow-inner">
                                ⌨️
                            </div>
                            <span className="text-lg font-black text-white mb-1">
                                {language === 'ta-IN' ? "தட்டச்சு வழி" : "Typing Method"}
                            </span>
                            <span className="text-xs text-gray-300 font-medium leading-relaxed mb-3">
                                {language === 'ta-IN' ? "விசைப்பலகை மூலம் நீங்களே நேரடியாக தட்டச்சு செய்யவும்" : "Type directly using keyboard and keypad"}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 bg-slate-800/80 border border-slate-700 px-2.5 py-0.5 rounded-full">
                                {language === 'ta-IN' ? "நேரடி உள்ளீடு" : "Direct Input"}
                            </span>
                        </button>
                    </div>

                    {/* Footer speech prompt hint */}
                    <div className="mt-6 flex items-center gap-2 text-xs text-cyan-300/80 bg-cyan-950/40 border border-cyan-800/50 rounded-xl px-3.5 py-2">
                        <span className="text-amber-400">💡</span>
                        <span>
                            {language === 'ta-IN'
                                ? "மைக்கில் 'குரல்' அல்லது 'தட்டச்சு' என்று கூறலாம் அல்லது அட்டையைத் தொடலாம்."
                                : "Say 'Voice' or 'Type' into the mic, or tap a card above."}
                        </span>
                    </div>

                </div>
            ) : (
                /* ═══════════════════════════════════════════════════════════ */
                /* STEP-BY-STEP SINGLE CARD CONTAINER (ONE BY ONE - NO SCROLL) */
                /* ═══════════════════════════════════════════════════════════ */
                <div className="w-full flex flex-col space-y-3.5">
                    
                    {/* Top Step Progress Bar */}
                    <div className="w-full flex items-center justify-center gap-2 px-1">
                        {/* Step pills */}
                        <div className="flex items-center gap-1.5 sm:gap-2">
                            {[
                                { idx: 0, label: language === 'ta-IN' ? "பெயர்" : "Name", done: Boolean(localData.name.trim()) },
                                { idx: 1, label: language === 'ta-IN' ? "கிராமம்" : "Village", done: Boolean(localData.village.trim()) },
                                { idx: 2, label: language === 'ta-IN' ? "தொலைபேசி" : "Phone", done: phoneDigits.length === 10 }
                            ].map((s) => (
                                <button
                                    key={s.idx}
                                    type="button"
                                    onClick={() => setStep(s.idx)}
                                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                        step === s.idx
                                            ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.8)] ring-2 ring-cyan-300'
                                            : s.done
                                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/70 hover:border-emerald-400'
                                            : 'bg-slate-900/70 text-gray-400 border border-slate-800 hover:border-slate-700'
                                    }`}
                                >
                                    <span>{s.done ? "✓" : `${s.idx + 1}.`}</span>
                                    <span>{s.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ───────────────────────────────────────────────────────────── */}
                    {/* STEP 0: NAME (பெயர்)                                          */}
                    {/* ───────────────────────────────────────────────────────────── */}
                    {step === 0 && (
                        <div className="w-full bg-[#091733]/95 border-2 border-cyan-500/50 rounded-3xl p-5 sm:p-6 shadow-[0_0_35px_rgba(6,182,212,0.25)] flex flex-col space-y-4 animate-fadeIn">
                            
                            <div className="border-b border-slate-800 pb-2.5 flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                                        {language === 'ta-IN' ? "படிநிலை 1 / 3" : "Step 1 of 3"}
                                    </span>
                                    <h2 className="text-2xl font-black text-white mt-0.5">
                                        {t.nameUI || (language === 'ta-IN' ? "பெயர்" : "Name")}
                                    </h2>
                                </div>
                                <span className="text-xs font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-700 px-2.5 py-1 rounded-full">
                                    {method === 'voice' 
                                        ? (language === 'ta-IN' ? "🎙️ குரல் / தட்டச்சு" : "🎙️ Voice / Typing") 
                                        : (language === 'ta-IN' ? "⌨️ தட்டச்சு" : "⌨️ Typing")}
                                </span>
                            </div>

                            <p className="text-cyan-100 text-base font-bold">
                                {t.namePrompt || (language === 'ta-IN' ? "உங்கள் பெயர் என்ன? சொல்லுங்கள் அல்லது தட்டச்சு செய்யவும்." : "What is your name? Speak or type.")}
                            </p>

                            <div className="relative">
                                <input
                                    type="text"
                                    autoFocus
                                    value={localData.name}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setLocalData(prev => ({ ...prev, name: val }));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && localData.name.trim()) setStep(1);
                                    }}
                                    placeholder={t.nameInputPlaceholder || (language === 'ta-IN' ? "உங்கள் பெயரை உள்ளிடவும்..." : "Type your full name...")}
                                    className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 text-lg outline-none transition-all pr-12 shadow-inner"
                                />
                                {localData.name && (
                                    <button
                                        type="button"
                                        onClick={() => setLocalData(prev => ({ ...prev, name: '' }))}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                        title="Clear"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Help tip */}
                            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex items-center gap-2">
                                <span className="text-amber-400 text-base">💡</span>
                                <p className="text-xs text-amber-200/90 font-medium">
                                    {method === 'voice'
                                        ? (language === 'ta-IN' ? "கீழே உள்ள மைக்கை 2-முறை தட்டி உங்கள் பெயரை கூறலாம் (அல்லது மேலே தட்டச்சு செய்யலாம்)." : "Double-tap bottom mic to speak your name, or type above.")
                                        : (language === 'ta-IN' ? "மேலே உள்ள பெட்டியில் உங்கள் பெயரை தட்டச்சு செய்து 'அடுத்த படி' அழுத்தவும்." : "Type your name above and click Next Step.")}
                                </p>
                            </div>

                            {/* Action Button */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (localData.name.trim()) setStep(1);
                                }}
                                disabled={!localData.name?.trim()}
                                className={`w-full py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                    localData.name?.trim()
                                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg transform active:scale-[0.99]'
                                        : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                }`}
                            >
                                <span>{t.nextStepBtn || (language === 'ta-IN' ? "அடுத்த படி ➔" : "Next Step ➔")}</span>
                            </button>

                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────────── */}
                    {/* STEP 1: VILLAGE (கிராமம் / ஊர்)                               */}
                    {/* ───────────────────────────────────────────────────────────── */}
                    {step === 1 && (
                        <div className="w-full bg-[#091733]/95 border-2 border-cyan-500/50 rounded-3xl p-5 sm:p-6 shadow-[0_0_35px_rgba(6,182,212,0.25)] flex flex-col space-y-4 animate-fadeIn">
                            
                            <div className="border-b border-slate-800 pb-2.5 flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                                        {language === 'ta-IN' ? "படிநிலை 2 / 3" : "Step 2 of 3"}
                                    </span>
                                    <h2 className="text-2xl font-black text-white mt-0.5">
                                        {t.villageUI || (language === 'ta-IN' ? "கிராமம் / ஊர்" : "Village")}
                                    </h2>
                                </div>
                                <span className="text-xs font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-700 px-2.5 py-1 rounded-full">
                                    {method === 'voice' 
                                        ? (language === 'ta-IN' ? "🎙️ குரல் / பரிந்துரை" : "🎙️ Voice / Suggestions") 
                                        : (language === 'ta-IN' ? "⌨️ தட்டச்சு" : "⌨️ Typing")}
                                </span>
                            </div>

                            <p className="text-cyan-100 text-base font-bold">
                                {t.villagePrompt || (language === 'ta-IN' ? "நீங்கள் எந்த ஊர் அல்லது கிராமத்தில் வசிக்கிறீர்கள்?" : "Which village or town do you live in?")}
                            </p>

                            <div className="relative">
                                <input
                                    type="text"
                                    autoFocus
                                    value={localData.village}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setLocalData(prev => ({ ...prev, village: val }));
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && localData.village.trim()) setStep(2);
                                    }}
                                    placeholder={t.villageInputPlaceholder || (language === 'ta-IN' ? "உங்கள் ஊர் அல்லது கிராமத்தை உள்ளிடவும்..." : "Type your village or town...")}
                                    className="w-full bg-[#0E1F3D] border-2 border-slate-700 focus:border-cyan-400 focus:ring-4 focus:ring-cyan-500/20 text-white font-bold rounded-2xl p-4 text-lg outline-none transition-all pr-12 shadow-inner"
                                />
                                {localData.village && (
                                    <button
                                        type="button"
                                        onClick={() => setLocalData(prev => ({ ...prev, village: '' }))}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white font-bold p-1 cursor-pointer"
                                        title="Clear"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>

                            {/* Popular Village Hubs Chips */}
                            <div className="w-full text-left">
                                <p className="text-[11px] text-gray-400 font-bold mb-1.5 flex items-center gap-1">
                                    <span>📍</span>
                                    <span>{t.popularVillagesTitle || (language === 'ta-IN' ? "பிரபலமான பகுதிகள் (தொடவும்):" : "Popular Hubs (Tap to select):")}</span>
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {POPULAR_VILLAGES.map((v) => {
                                        const hubName = language === 'ta-IN' ? v.local : v.title;
                                        const isSelected = localData.village === hubName;
                                        return (
                                            <button
                                                key={v.title}
                                                type="button"
                                                onClick={() => {
                                                    triggerKeyFeedback();
                                                    setLocalData(prev => ({ ...prev, village: hubName }));
                                                }}
                                                className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-cyan-500 text-slate-950 border-cyan-400 font-black shadow-md'
                                                        : 'bg-slate-800/90 hover:bg-cyan-900/50 hover:border-cyan-400 text-cyan-200 border-slate-700'
                                                }`}
                                            >
                                                {hubName}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="w-full grid grid-cols-2 gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setStep(0)}
                                    className="py-3.5 rounded-2xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer text-sm"
                                >
                                    {t.prevStepBtn || (language === 'ta-IN' ? "⬅ பின்" : "⬅ Back")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (localData.village.trim()) setStep(2);
                                    }}
                                    disabled={!localData.village?.trim()}
                                    className={`py-3.5 rounded-2xl font-black text-base flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                        localData.village?.trim()
                                            ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg transform active:scale-[0.99]'
                                            : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    <span>{t.nextStepBtn || (language === 'ta-IN' ? "அடுத்த படி ➔" : "Next Step ➔")}</span>
                                </button>
                            </div>

                        </div>
                    )}

                    {/* ───────────────────────────────────────────────────────────── */}
                    {/* STEP 2: PHONE (தொலைபேசி எண்) - KEYPAD TYPING ONLY!           */}
                    {/* ───────────────────────────────────────────────────────────── */}
                    {step === 2 && (
                        <div className="w-full bg-[#091733]/95 border-2 border-cyan-500/50 rounded-3xl p-4 sm:p-5 shadow-[0_0_35px_rgba(6,182,212,0.25)] flex flex-col space-y-3 animate-fadeIn">
                            
                            <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                                <div>
                                    <span className="text-xs font-black uppercase text-cyan-400 tracking-wider">
                                        {language === 'ta-IN' ? "படிநிலை 3 / 3" : "Step 3 of 3"}
                                    </span>
                                    <h2 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                                        {t.phoneUI || (language === 'ta-IN' ? "தொலைபேசி எண்" : "Phone Number")}
                                    </h2>
                                </div>
                                <span className="text-[11px] font-black text-amber-300 bg-amber-950/80 border border-amber-600/80 px-2.5 py-1 rounded-full">
                                    {language === 'ta-IN' ? "🔢 விசைப்பலகை மட்டும்" : "🔢 Keypad Only"}
                                </span>
                            </div>

                            {/* 10-Slot Visual Indicator */}
                            <div className="w-full flex flex-col items-center py-1">
                                <div className="flex items-center gap-1 sm:gap-1.5 mb-1.5">
                                    <span className="text-xs font-extrabold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded-lg border border-cyan-700 mr-1">
                                        🇮🇳 +91
                                    </span>
                                    {/* 10 PIN Slots */}
                                    {Array.from({ length: 10 }).map((_, idx) => {
                                        const char = phoneDigits[idx] || '';
                                        const isCurrent = idx === phoneDigits.length;
                                        return (
                                            <div
                                                key={idx}
                                                className={`w-7 sm:w-8 h-9 sm:h-10 rounded-xl flex items-center justify-center font-mono font-black text-base sm:text-lg border-2 transition-all ${
                                                    char 
                                                        ? 'bg-cyan-950/90 text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                                                        : isCurrent
                                                        ? 'bg-slate-900 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)] animate-pulse text-amber-300'
                                                        : 'bg-slate-900/60 border-slate-700 text-slate-500'
                                                }`}
                                            >
                                                {char || '·'}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="flex items-center justify-between w-full px-2 text-xs">
                                    <span className="text-gray-400 font-semibold">
                                        {language === 'ta-IN' ? "விசைப்பலகையில் 10 எண்களை தட்டவும்" : "Type 10 digits on the keypad"}
                                    </span>
                                    <span className={`font-mono font-black ${phoneDigits.length === 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                        {phoneDigits.length === 10 
                                            ? (language === 'ta-IN' ? "✓ 10/10 பூர்த்தி" : "✓ 10/10 Done") 
                                            : `${phoneDigits.length} / 10`}
                                    </span>
                                </div>
                            </div>

                            {/* Responsive Compact Numpad */}
                            <div className="w-full max-w-sm mx-auto grid grid-cols-3 gap-2">
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                                    <button
                                        key={digit}
                                        type="button"
                                        onClick={() => handleNumPadPress(digit)}
                                        className="h-12 sm:h-13 rounded-2xl bg-[#0e1d38] hover:bg-cyan-900/60 active:bg-cyan-600 border border-slate-700 hover:border-cyan-400 text-white font-mono font-black text-xl sm:text-2xl shadow-md transition-all cursor-pointer flex items-center justify-center transform active:scale-95"
                                    >
                                        {digit}
                                    </button>
                                ))}

                                {/* Backspace */}
                                <button
                                    type="button"
                                    onClick={handleBackspace}
                                    className="h-12 sm:h-13 rounded-2xl bg-rose-950/60 hover:bg-rose-900 active:bg-rose-700 border border-rose-700/60 text-rose-200 font-bold text-sm shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 transform active:scale-95"
                                    title="Backspace"
                                >
                                    <span>⌫</span>
                                    <span>{t.deleteDigitBtn || (language === 'ta-IN' ? "அழி" : "Del")}</span>
                                </button>

                                {/* Zero */}
                                <button
                                    type="button"
                                    onClick={() => handleNumPadPress('0')}
                                    className="h-12 sm:h-13 rounded-2xl bg-[#0e1d38] hover:bg-cyan-900/60 active:bg-cyan-600 border border-slate-700 hover:border-cyan-400 text-white font-mono font-black text-xl sm:text-2xl shadow-md transition-all cursor-pointer flex items-center justify-center transform active:scale-95"
                                >
                                    0
                                </button>

                                {/* Clear All */}
                                <button
                                    type="button"
                                    onClick={handleClear}
                                    className="h-12 sm:h-13 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-gray-300 font-bold text-xs shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 transform active:scale-95"
                                    title="Clear All"
                                >
                                    <span>✕</span>
                                    <span>{t.clearAllBtn || (language === 'ta-IN' ? "நீக்கு" : "Clear")}</span>
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="w-full grid grid-cols-3 gap-2.5 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="py-3 rounded-2xl font-bold text-gray-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all cursor-pointer text-sm"
                                >
                                    {t.prevStepBtn || (language === 'ta-IN' ? "⬅ பின்" : "⬅ Back")}
                                </button>

                                <button
                                    type="button"
                                    onClick={handleConfirmRegistration}
                                    disabled={phoneDigits.length !== 10}
                                    className={`col-span-2 py-3 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                        phoneDigits.length === 10
                                            ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.7)] animate-pulse'
                                            : 'bg-slate-800 text-gray-500 border border-slate-700 cursor-not-allowed opacity-60'
                                    }`}
                                >
                                    <span>✓</span>
                                    <span>
                                        {phoneDigits.length === 10
                                            ? (language === 'ta-IN' ? "பதிவை முடி ➔" : "Complete Registration ➔")
                                            : (language === 'ta-IN' ? `${phoneDigits.length}/10 எண்கள்` : `${phoneDigits.length}/10 Digits`)}
                                    </span>
                                </button>
                            </div>

                        </div>
                    )}

                </div>
            )}

            {/* Status Feedback toast if present */}
            {statusFeedback && (
                <div className="mt-2 text-xs text-cyan-300/90 font-semibold px-3 py-1 rounded-xl bg-slate-900/70 border border-slate-800/80 animate-fadeIn">
                    {statusFeedback}
                </div>
            )}

        </div>
    );
};
