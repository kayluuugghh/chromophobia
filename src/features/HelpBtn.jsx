/*****************************************
 * 
 * Contribution to code made by: 
 * Drishya Regmi
 * Kayla Vo
 * 
 *****************************************/
import { useState } from "react";
import { BsQuestionCircle } from "react-icons/bs";
import { Link } from "react-router-dom";
import '../assets/css/HelpBtn.css';

function HelpBtn() {
    const [isOpen, setMenuOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false); // modal state
    const [isHelpOpen, setIsHelpOpen] = useState(false); // modal state
    const toggleAbout = () => {setIsAboutOpen(!isAboutOpen)};
    const toggleHelp = () => {setIsHelpOpen(!isHelpOpen)};
    const handleMouseEnter = () => setMenuOpen(true);
    const handleMouseLeave = () => setMenuOpen(false);

    return (
        <>
        <nav className="navbar">
            <div className="nav-container" 
                onMouseEnter={handleMouseEnter} 
                onMouseLeave={handleMouseLeave}>
                {/* 3 stacked bars to create hamburger icon */}
                <div className= "hamburger">
                    <div className="bar"></div>
                    <div className="bar"></div>
                    <div className="bar"></div>
                </div>

                {/* navigation links  */}
                <ul className={`nav-links ${isOpen ? "open" : ""}`}>
                    <li><Link to="/home">Home</Link></li>
                    <li><a onClick={toggleAbout} className="link-btn">About</a></li>
                    <li><Link to="/team">Team</Link></li>
                    <li><Link to="/">Logout</Link></li>
                </ul>
            </div>
                {/* Help button */}
                <button onClick={toggleHelp} className="help-btn"><BsQuestionCircle className="help-icon" /></button>
        </nav>
        {/* About Modal */}
        {isAboutOpen && (
            <div className="modal-overlay" onClick={toggleAbout}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button onClick={toggleAbout} className="close-btn">X</button>
                    <h2>About Chromophobia</h2>
                    <p>
                        Chromophobia is a web based application that pays homage to the music visualizers that dominated 
                        the late 1990s to early 2000s by replicating the nostalgic visualizations using modern technological
                        advancements. The software aims to use machine learning to identify patterns such as tempo and 
                        musical structure to generate visuals that dynamically adapt to the music. The decision to begin 
                        this project was the result of a collaborative brainstorming and voting process for the Senior Project
                        course.
                        <br></br><br></br>
                        To learn more about our project, check out our <a href="https://github.com/kayluuugghh/chromophobia" target="_blank" rel="noopener noreferrer">GitHub repository</a>.
                    </p>
                </div>
            </div>
        )}
        {/* Instructions Modal */}
        {isHelpOpen && (
            <div className="modal-overlay" onClick={toggleHelp}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button onClick={toggleHelp} className="close-btn">X</button>
                    <h2>Need Help?</h2>
                    <p>
                        If you're having trouble with the application, here are some steps you can take:
                        <ul id="list">
                            <li>Ensure you have a stable internet connection.</li>
                            <li>Try refreshing the page or restarting the application.</li>
                            <li>Check if your Spotify account is properly linked and has the necessary permissions.</li>
                            <li>Make sure that you are playing music through this page by checking your device connection on Spotify.</li>
                        </ul>
                    </p>
                </div>
            </div>
        )}
        </>
    );
}

export default HelpBtn;