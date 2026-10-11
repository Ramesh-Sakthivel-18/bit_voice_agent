import React, { useEffect, useState } from 'react';
import { getSellerListings } from '../services/api';

export const SellerListings = ({ language, user, onBack }) => {
    const [listings, setListings] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchListings = async () => {
            try {
                const data = await getSellerListings(user.user_id);
                setListings(data.listings || []);
            } catch (err) {
                console.error("Error fetching listings", err);
            } finally {
                setLoading(false);
            }
        };
        fetchListings();
    }, [user.user_id]);

    return (
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center p-8">
            <div className="w-full flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">
                    {language === 'ta-IN' ? "என் விற்பனைப் பொருட்கள்" : "My Active Listings"}
                </h1>
                <button 
                    onClick={onBack}
                    className="px-6 py-2 bg-gray-800 text-white font-bold rounded-lg hover:bg-gray-700 transition-colors"
                >
                    {language === 'ta-IN' ? "திரும்பச் செல்" : "Back to Dashboard"}
                </button>
            </div>

            {loading ? (
                <div className="text-2xl text-gray-400 mt-20 animate-pulse">
                    {language === 'ta-IN' ? "ஏற்றுகிறது..." : "Loading listings..."}
                </div>
            ) : listings.length === 0 ? (
                <div className="text-2xl text-gray-400 mt-20">
                    {language === 'ta-IN' ? "தற்போது எந்த பொருட்களும் இல்லை." : "You have no active listings."}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                    {listings.map((item) => (
                        <div key={item.id} className="bg-gray-800/80 rounded-2xl p-6 border border-gray-700 shadow-xl flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-2xl font-bold text-brightYellow">{item.title}</h3>
                                <span className={`px-3 py-1 rounded-full text-sm font-bold border ${item.status === 'ACTIVE' ? 'bg-green-900/50 text-green-400 border-green-700' : 'bg-gray-900/50 text-gray-400 border-gray-700'}`}>
                                    {item.status}
                                </span>
                            </div>
                            
                            <p className="text-gray-300 text-sm mb-6 flex-grow italic">"{item.description}"</p>
                            
                            <div className="grid grid-cols-2 gap-4 mt-auto">
                                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-xs uppercase tracking-wider">{language === 'ta-IN' ? "அளவு" : "Quantity"}</p>
                                    <p className="text-white font-bold text-lg">{item.quantity} {item.unit}</p>
                                </div>
                                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                                    <p className="text-gray-400 text-xs uppercase tracking-wider">{language === 'ta-IN' ? "விலை" : "Price"}</p>
                                    <p className="text-white font-bold text-lg">₹{item.price_per_unit}/{item.unit}</p>
                                </div>
                            </div>
                            
                            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-center mb-4">
                                <p className="text-yellow-500 text-xs uppercase tracking-wider mb-1">{language === 'ta-IN' ? "மொத்த மதிப்பு" : "Total Value"}</p>
                                <p className="text-yellow-400 font-bold text-2xl">₹{item.total_price}</p>
                            </div>
                            
                            {item.interested_buyers && item.interested_buyers.length > 0 && (
                                <div className="mt-2 bg-purple-900/30 border border-purple-500/50 rounded-lg p-4">
                                    <h4 className="text-purple-300 font-bold text-sm mb-3 border-b border-purple-500/30 pb-2">
                                        {language === 'ta-IN' ? "ஆர்வமுள்ள வாங்குபவர்கள்" : "Interested Buyers"} ({item.interested_buyers.length})
                                    </h4>
                                    <div className="flex flex-col gap-3">
                                        {item.interested_buyers.map((buyer, idx) => (
                                            <div key={idx} className="bg-gray-800 p-3 rounded flex justify-between items-center">
                                                <div>
                                                    <p className="text-white font-bold">{buyer.name}</p>
                                                    <p className="text-gray-400 text-xs">📍 {buyer.village}</p>
                                                </div>
                                                <a 
                                                    href={`tel:${buyer.phone}`}
                                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white text-sm font-bold rounded flex items-center gap-2 transition-colors"
                                                >
                                                    📞 {language === 'ta-IN' ? "அழைக்க" : "Call"}
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
