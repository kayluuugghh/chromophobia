import { useState } from "react";
import { BsBrush } from "react-icons/bs";
import '../assets/css/CustomBtn.css';
import { Link } from "react-router-dom";

function CustomBtn({stats, actions}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const { 
        mood, avgMood, accentColor, wsStatus, confidence, 
        scores, avgScores, moodHistory, listening, mode,
        MOOD_EMOJI, MOOD_DESC, MOODS_ORDER, MOOD_COLORS,
        scoreWindowRef 
    } = stats;
    const { stopCapture, setMode } = actions;

    return (
        <>
            <nav className="navbar">
                <button onClick={() => setIsDrawerOpen(!isDrawerOpen)} className="customize-btn">
                    <BsBrush className="customize-icon" />
                </button>
            </nav>

            {isDrawerOpen && <div onClick={() => setIsDrawerOpen(false)} />}
            
            <div className={`info-drawer ${isDrawerOpen ? 'open' : ''}`} style={{ "--accent": accentColor }}>
                <div className="drawer-header">
                    <button className="close-x" onClick={() => setIsDrawerOpen(false)}>x</button>
                    <h3>Customization & Diagnostics</h3>
                </div>

                <div className="drawer-content">
                    {listening ? (
                        <>
                            <div className="options">
                                <button onClick={stopCapture}>Stop sharing audio</button>
                                <select value={mode} onChange={e => setMode(Number(e.target.value))}>
                                    <option value={0}>Spectrum Analyzer</option>
                                    <option value={1}>Constellation</option>
                                    <option value={2}>Aurora Plasma</option>
                                    <option value={3}>Ferrofluid</option>
                                    <option value={4}>Cymatics + Reaction-Diffusion</option>
                                </select>
                            </div>

                            <div className="moodOverlay" style={{ "--accent": accentColor }}>
                                <div className="moodPanel moodPanel--avg">
                                    <div className="moodPanelTitle">10-min avg ✦ visuals</div>
                                    <div
                                        className="moodLabel"
                                        style={{
                                        color: accentColor,
                                        textShadow: `0 0 18px ${accentColor}99`,
                                        transition: "color 1.2s ease, text-shadow 1.2s ease",
                                    }}>
                                        { avgMood ? `${MOOD_EMOJI[avgMood]} ${avgMood}` : "—" }
                                    </div>

                                    { avgMood && (
                                        <div
                                        className="moodDesc"
                                        style={{ color: accentColor + "bb", transition: "color 1.2s ease" }}
                                        >
                                        visuals are {MOOD_DESC[avgMood]}
                                        </div>
                                    )}

                                     <div className="moodWindowNote">
                                        { scoreWindowRef.current.length } samples · last {
                                        scoreWindowRef.current.length
                                            ? Math.ceil((Date.now() - scoreWindowRef.current[0].ts) / 1000)
                                            : 0
                                        }s
                                    </div>
                                </div>
                            </div>

                            { avgMood && (
                                <div className="moodBars">
                                <div className="moodBarsTitle">10-min score average</div>
                                { MOODS_ORDER.map(m => {
                                    const pct  = ((avgScores[m]  ?? 0) * 100).toFixed(1);
                                    const pctNow = ((scores[m] ?? 0) * 100).toFixed(1);
                                    const isWinner = m === avgMood;
                                    return (
                                    <div key={m} className="moodBarRow">
                                        <span className="moodBarLabel">
                                        {MOOD_EMOJI[m]} {m}
                                        </span>
                                        <div className="moodBarTrack">
                                        {/* Averaged bar (solid) */}
                                        <div
                                            className="moodBarFill"
                                            style={{
                                            width: `${pct}%`,
                                            background: isWinner ? MOOD_COLORS[m] : "#ffffff22",
                                            boxShadow: isWinner ? `0 0 8px ${MOOD_COLORS[m]}` : "none",
                                            transition: "width 0.8s ease, background 1s ease, box-shadow 1s ease",
                                            }}
                                        />
                                        {/* Instant marker (thin line showing current reading) */}
                                        <div
                                            className="moodBarInstantMarker"
                                            style={{
                                            left: `${pctNow}%`,
                                            background: MOOD_COLORS[m],
                                            }}
                                        />
                                        </div>
                                        <span className="moodBarPct">{pct}%</span>
                                    </div>
                                    );
                                })}
                                </div>
                            )}
                        </>
                    ) : (
                      <p className="idle-msg">Start sharing screen audio to start customizing and see diagnostics!</p>  
                    )}
                </div>
            </div>
        </>
    );
}

export default CustomBtn;