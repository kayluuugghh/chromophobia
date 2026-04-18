import { useState } from "react";
import { BsQuestionCircle } from "react-icons/bs";
import { Link } from "react-router-dom";
import '../assets/css/HelpBtn.css';

function HelpBtn() {
    const [isOpen, setMenuOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false); // modal state
    const handleHelp = () => {alert("Help coming soon.");};
    const toggleAbout = () => {setIsAboutOpen(!isAboutOpen)};
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
                <button onClick={handleHelp} className="help-btn"><BsQuestionCircle className="help-icon" /></button>
        </nav>
        </>
    );
}

export default HelpBtn;