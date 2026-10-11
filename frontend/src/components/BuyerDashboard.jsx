import React, { useEffect, useState } from 'react';
import { playTTS } from '../services/api';
import { BuyerCommerceView } from './BuyerCommerceView';

export const BuyerDashboard = ({ language, user }) => {
    const [orbState, setOrbState] = useState('idle');
    const [viewMode, setViewMode] = useState('dashboard'); // 'dashboard' | 'commerce'

    useEffect(() => {
        if (viewMode !== 'dashboard') return;
        
        const greet = language === 'ta-IN' ? `வணக்கம் ${user.name}` : `Hello ${user.name}`;
        playTTS(greet, language);
        
        const timer = setTimeout(() => {
            setOrbState('speaking');
            const prompt = language === 'ta-IN' 
                ? "பொருட்களை வாங்க மைக்ரோஃபோனை தட்டுங்கள்"
                : "Tap the microphone to search for products";
            
            const utter = new SpeechSynthesisUtterance(prompt);
            utter.lang = language;
            utter.onend = () => setOrbState('idle');
            window.speechSynthesis.speak(utter);
        }, 2500);
        
        return () => {
            clearTimeout(timer);
            window.speechSynthesis.cancel();
        };
    }, [language, user, viewMode]);

    if (viewMode === 'commerce') {
        return <BuyerCommerceView language={language} user={user} />;
    }

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col items-center p-8 relative">
            <button 
                onClick={() => {
                    sessionStorage.clear();
                    window.location.href = '/';
                }}
                className="absolute top-8 right-8 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg"
            >
                {language === 'ta-IN' ? "வெளியேறு" : "Logout"}
            </button>

            <h1 className="text-5xl font-bold text-white mb-10 mt-8">
                {language === 'ta-IN' ? "வணக்கம்" : "Welcome"}, <span className="text-brightYellow">{user.name}!</span>
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full mb-16">
                <div className="bg-gray-800/80 p-6 rounded-2xl border-l-4 border-purple-500 shadow-lg flex items-center gap-4">
                    <div className="text-4xl">🛒</div>
                    <div>
                        <p className="text-gray-400 text-sm">Role</p>
                        <p className="text-white text-xl font-bold capitalize">{user.role}</p>
                    </div>
                </div>
                
                <div className="bg-gray-800/80 p-6 rounded-2xl border-l-4 border-blue-500 shadow-lg flex items-center gap-4">
                    <div className="text-4xl">📍</div>
                    <div>
                        <p className="text-gray-400 text-sm">Location</p>
                        <p className="text-white text-xl font-bold capitalize">{user.village || 'N/A'}</p>
                    </div>
                </div>
                
                <div className="bg-gray-800/80 p-6 rounded-2xl border-l-4 border-green-500 shadow-lg flex items-center gap-4">
                    <div className="text-4xl">📞</div>
                    <div>
                        <p className="text-gray-400 text-sm">Contact</p>
                        <p className="text-white text-xl font-bold">{user.phone || 'N/A'}</p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-8 w-full justify-center items-center">
                <div 
                    onClick={() => setViewMode('commerce')}
                    className="flex flex-col items-center justify-center p-10 bg-gray-900/50 rounded-3xl border border-gray-700 w-full max-w-md shadow-2xl cursor-pointer hover:bg-gray-800/50 hover:scale-105 transition-all duration-300"
                >
                    <div className="relative w-40 h-40 mb-8 flex items-center justify-center">
                        <div className={`absolute inset-0 rounded-full bg-blue-500 opacity-30 ${orbState === 'speaking' ? 'animate-ping' : 'animate-pulse'}`}></div>
                        <div className="relative z-10 w-28 h-28 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-[0_0_40px_rgba(6,182,212,0.8)] flex items-center justify-center hover:scale-110 transition-transform">
                            <span className="text-5xl">🎙️</span>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-center text-blue-300">
                        {language === 'ta-IN' ? "பொருட்களை தேடு" : "Search Products"}
                    </h2>
                </div>
            </div>
        </div>
    );
};
