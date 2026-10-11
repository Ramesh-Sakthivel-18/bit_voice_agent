import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { playTTS, transcribeAudio, parseIntent } from '../services/api';
import { getTranslation } from '../utils/translations';

export const VoiceOnboarding = ({ language, userData, onComplete }) => {
    const [step, setStep] = useState(0); // 0: Name, 1: Village, 2: Phone
    const [orbState, setOrbState] = useState('speaking'); // 'speaking' | 'listening' | 'processing'
    const [transcript, setTranscript] = useState('');
    const [localData, setLocalData] = useState({ name: '', village: '', phone: '' });
    const localDataRef = useRef({ name: '', village: '', phone: '' });
    
    const recognitionRef = useRef(null);
    const timeoutRef = useRef(null);
    const activeRef = useRef(true);
    
    const t = getTranslation(language);
    const unmounted = useRef(false);

    const questions = [
        { key: 'name', prompt: t.namePrompt, entity: 'name', title: t.nameUI },
        { key: 'village', prompt: t.villagePrompt, entity: 'village', title: t.villageUI },
        { key: 'phone', prompt: t.phonePrompt, entity: 'phone', title: t.phoneUI }
    ];

    const startListening = useCallback((currentStep) => {
        if (!activeRef.current) return;
        setOrbState('listening');
        setTranscript(language === 'ta-IN' ? 'சொல்லுங்கள்...' : 'Please speak...');
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return;

        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language;
        
        let finalTranscript = "";

        recognition.onresult = (event) => {
            if (!activeRef.current) return;
            let interimTranscript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            setTranscript(`"${finalTranscript || interimTranscript}"`);
            
            if (finalTranscript) {
                clearTimeout(timeoutRef.current);
                processTranscript(finalTranscript, currentStep);
            }
        };
        
        recognition.onend = () => {
             if (activeRef.current && orbState === 'listening') {
                 try { recognition.start(); } catch(e){}
             }
        };

        recognitionRef.current = recognition;
        try { recognition.start(); } catch(e){}
        
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
            if (activeRef.current) {
                if (recognitionRef.current) {
                    try { recognitionRef.current.abort(); } catch(e){}
                }
                const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. தயவுசெய்து மீண்டும் கூறவும்." : "मैं समझ नहीं पाया। कृपया फिर से बोलें।";
                playReprompt(errorMsg, currentStep);
            }
        }, 10000);
    }, [language, orbState]);

    const processTranscript = async (text, currentStep) => {
        if (!activeRef.current) return;
        activeRef.current = false;
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        
        setOrbState('processing');
        setTranscript(language === 'ta-IN' ? 'பகுப்பாய்வு...' : 'Processing...');
        
        const q = questions[currentStep];
        try {
            const intentRes = await parseIntent(text, q.entity);
            const extracted = intentRes.extracted_value;
            
            localDataRef.current[q.key] = extracted;
            setLocalData({ ...localDataRef.current });
            
            setTranscript(`✅ ${extracted}`);
            const prefix = language === 'ta-IN' ? "நான் கேட்டது:" : "मैंने सुना";
            
            const utter = new SpeechSynthesisUtterance(`${prefix} ${extracted}`);
            utter.lang = language;
            utter.volume = 0.6;
            
            utter.onend = () => {
                if (unmounted.current) return;
                activeRef.current = true;
                if (currentStep < 2) {
                    setStep(currentStep + 1);
                } else {
                    onComplete({ ...localDataRef.current });
                }
            };
            window.speechSynthesis.speak(utter);
            
        } catch (err) {
            console.error("Onboarding error", err);
            const errorMsg = language === 'ta-IN' ? "எனக்கு புரியவில்லை. தயவுசெய்து மீண்டும் கூறவும்." : "मैं समझ नहीं पाया। कृपया फिर से बोलें।";
            playReprompt(errorMsg, currentStep);
        }
    };

    const playReprompt = useCallback((msg, currentStep) => {
        if (unmounted.current) return;
        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'மன்னிக்கவும்...' : 'Sorry...');
        
        const utter = new SpeechSynthesisUtterance(msg);
        utter.lang = language;
        utter.volume = 0.6;
        utter.onend = () => {
            activeRef.current = true;
            askQuestion(currentStep, true);
        };
        window.speechSynthesis.speak(utter);
    }, [language]);

    const askQuestion = useCallback((currentStep, isReprompt = false) => {
        if (unmounted.current) return;
        activeRef.current = true;
        
        const q = questions[currentStep];
        setOrbState('speaking');
        setTranscript(language === 'ta-IN' ? 'கேள்வி கேட்கிறது...' : 'Asking...');
        
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e){}
        }
        window.speechSynthesis.cancel();
        
        const textToSpeak = isReprompt ? q.prompt : q.prompt; // Can alter if we want
        const utter = new SpeechSynthesisUtterance(textToSpeak);
        utter.lang = language;
        utter.volume = 0.6;
        
        utter.onend = () => startListening(currentStep);
        
        // Safety timeout
        setTimeout(() => {
            if (orbState === 'speaking' && activeRef.current) {
                startListening(currentStep);
            }
        }, 8000);

        window.speechSynthesis.speak(utter);
    }, [language, startListening, orbState]);

    useEffect(() => {
        askQuestion(step);
    }, [step]); // re-run when step changes

    useEffect(() => {
        return () => {
            unmounted.current = true;
            activeRef.current = false;
            clearTimeout(timeoutRef.current);
            window.speechSynthesis.cancel();
            if (recognitionRef.current) {
                try { recognitionRef.current.abort(); } catch(e){}
            }
        };
    }, []);

    const currentQ = questions[step];

    return (
        <div className="w-full max-w-2xl text-center flex flex-col items-center">
            <h2 className="text-4xl font-bold mb-12 text-white">
                {currentQ.title}
            </h2>

            {/* The Voice Orb */}
            <div className="relative w-48 h-48 mb-10 flex items-center justify-center">
                {orbState === 'speaking' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-purple-500 opacity-40 animate-ping"></div>
                        <div className="absolute inset-4 rounded-full bg-blue-500 opacity-60 animate-pulse"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 shadow-[0_0_50px_rgba(147,51,234,0.8)] flex items-center justify-center">
                            <span className="text-5xl">🤖</span>
                        </div>
                    </>
                )}
                {orbState === 'listening' && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-ping"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-green-500 shadow-[0_0_60px_rgba(34,197,94,0.9)] flex items-center justify-center">
                            <span className="text-5xl">🎙️</span>
                        </div>
                    </>
                )}
                {orbState === 'processing' && (
                    <div className="relative z-10 w-28 h-28 rounded-full bg-yellow-500 shadow-[0_0_60px_rgba(234,179,8,0.9)] flex items-center justify-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-white"></div>
                    </div>
                )}
            </div>
            
            {/* Live Voice Subtitle Box */}
            <div className={`mb-12 px-10 py-5 rounded-full border-2 text-2xl font-bold min-w-[350px] shadow-lg transition-colors
                ${orbState === 'listening' ? 'border-green-500 text-green-400 bg-green-900/30' : ''}
                ${orbState === 'speaking' ? 'border-purple-500 text-purple-300 bg-purple-900/30' : ''}
                ${orbState === 'processing' ? 'border-yellow-400 text-yellow-400 bg-yellow-900/30' : ''}
            `}>
                {transcript}
            </div>

            {/* Progress Indicators */}
            <div className="flex gap-4 mt-4">
                {[0, 1, 2].map((idx) => (
                    <div 
                        key={idx}
                        className={`h-3 w-16 rounded-full transition-colors duration-500 ${idx === step ? 'bg-brightYellow shadow-[0_0_10px_rgba(250,204,21,0.8)]' : idx < step ? 'bg-green-500' : 'bg-gray-700'}`}
                    />
                ))}
            </div>
        </div>
    );
};
