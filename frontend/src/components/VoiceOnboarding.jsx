import React, { useState, useEffect, useRef, useCallback } from 'react';
import { parseIntent } from '../services/api';
import { getTranslation } from '../utils/translations';
import { useSmartVoice } from '../context/SmartVoiceContext';
import { normalizeText } from '../utils/voiceMatcher';

export const VoiceOnboarding = ({ language, userData, onComplete }) => {
    const { 
        setPageContext,
        setScreenInstruction, 
        setGuidePrompt, 
        speak,
        registerVoiceHandler, 
        unregisterVoiceHandler 
    } = useSmartVoice();

    const [step, setStep] = useState(0); // 0: Name, 1: Village, 2: Phone
    const [statusFeedback, setStatusFeedback] = useState('');
    const [localData, setLocalData] = useState({ name: '', village: '', phone: '' });
    const localDataRef = useRef({ name: '', village: '', phone: '' });
    const unmounted = useRef(false);

    const t = getTranslation(language);

    const questions = [
        { key: 'name', prompt: t.namePrompt || (language === 'ta-IN' ? "உங்கள் பெயர் என்ன? சொல்லுங்கள்." : "What is your name? Please speak."), entity: 'name', title: t.nameUI || (language === 'ta-IN' ? "பெயர்" : "Name") },
        { key: 'village', prompt: t.villagePrompt || (language === 'ta-IN' ? "நீங்கள் எந்த ஊர் அல்லது கிராமத்தில் வசிக்கிறீர்கள்?" : "Which village or town do you live in?"), entity: 'village', title: t.villageUI || (language === 'ta-IN' ? "கிராமம்" : "Village") },
        { key: 'phone', prompt: t.phonePrompt || (language === 'ta-IN' ? "உங்கள் தொலைபேசி எண்ணை சொல்லுங்கள்." : "What is your phone number?"), entity: 'phone', title: t.phoneUI || (language === 'ta-IN' ? "தொலைபேசி எண்" : "Phone") }
    ];

    const currentQ = questions[step];

    // Update pageContext & Screen Instruction per step
    useEffect(() => {
        if (!currentQ) return;

        const pageCtx = language === 'ta-IN' 
            ? `பதிவு: படி ${step + 1}/3 (${currentQ.title})` 
            : `Registration: Step ${step + 1}/3 (${currentQ.title})`;
        setPageContext(pageCtx);

        setScreenInstruction(currentQ.prompt, true);

        const guide = language === 'ta-IN'
            ? "கீழே உள்ள மைக்கை இரட்டை தட்டி உங்கள் பதிலை கூறவும்."
            : "Double-tap bottom mic and speak your answer clearly.";
        setGuidePrompt(guide);

        return () => {
            setPageContext('');
        };
    }, [step, language, currentQ, setPageContext, setScreenInstruction, setGuidePrompt]);

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
                    onComplete({ ...localDataRef.current });
                }
            }, 1400);

        } catch (err) {
            console.error("Onboarding error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. தயவுசெய்து மீண்டும் கூறவும்." : "I didn't catch that. Please repeat.";
            setStatusFeedback(errorMsg);
            speak(errorMsg, language);
        }
    }, [language, questions, onComplete, speak]);

    // Register active voice command handler
    useEffect(() => {
        const handleVoiceInput = (rawText) => {
            if (!rawText) return;
            const text = normalizeText(rawText);
            console.log(`[Onboarding Step ${step} Voice Input]:`, text);
            processVoiceAnswer(rawText, step);
        };

        registerVoiceHandler(handleVoiceInput);

        return () => {
            unregisterVoiceHandler();
        };
    }, [step, registerVoiceHandler, unregisterVoiceHandler, processVoiceAnswer]);

    useEffect(() => {
        return () => {
            unmounted.current = true;
        };
    }, []);

    return (
        <div className="w-full max-w-2xl text-center flex flex-col items-center p-6 pb-36">
            <span className="text-xs font-black uppercase tracking-widest text-cyan-400 bg-cyan-950/60 px-4 py-1.5 rounded-full border border-cyan-700/60 mb-4">
                {language === 'ta-IN' ? `படிநிலை ${step + 1} / 3` : `Step ${step + 1} of 3`}
            </span>

            <h1 className="text-3xl md:text-5xl font-black text-white mb-2">
                {currentQ.title}
            </h1>
            <p className="text-cyan-200 text-lg md:text-xl font-bold mb-8 max-w-lg">
                {currentQ.prompt}
            </p>

            {/* Status Feedback Card (No local mic buttons, no middle mic orbs) */}
            <div className="w-full max-w-lg bg-[#0B152B]/90 border border-slate-700/80 rounded-2xl px-6 py-4 mb-8 shadow-xl text-center min-h-[56px] flex items-center justify-center">
                <span className="text-base font-bold text-amber-300">
                    {statusFeedback || (language === 'ta-IN' ? "கீழே உள்ள மைக்கை இரட்டை தட்டி உடனே பேசவும்" : "Double-tap bottom mic to speak")}
                </span>
            </div>

            {/* Recorded Fields Summary */}
            <div className="w-full grid grid-cols-3 gap-3 mb-8">
                {questions.map((q, idx) => (
                    <div 
                        key={q.key}
                        className={`p-4 rounded-2xl border transition-all ${
                            idx === step 
                                ? 'bg-[#0E2042] border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.4)]' 
                                : localData[q.key]
                                ? 'bg-emerald-950/30 border-emerald-500/60'
                                : 'bg-[#09152B]/60 border-slate-800'
                        }`}
                    >
                        <p className="text-xs text-gray-400 font-bold uppercase">{q.title}</p>
                        <p className="text-white font-black text-base truncate mt-1">
                            {localData[q.key] || '---'}
                        </p>
                    </div>
                ))}
            </div>

            {/* Step Progress Indicators */}
            <div className="flex gap-4 mt-2">
                {[0, 1, 2].map((idx) => (
                    <div 
                        key={idx}
                        className={`h-2.5 w-16 rounded-full transition-all duration-500 ${
                            idx === step 
                                ? 'bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.9)] animate-pulse' 
                                : idx < step 
                                ? 'bg-emerald-500' 
                                : 'bg-slate-800'
                        }`}
                    />
                ))}
            </div>
        </div>
    );
};
