import { useState } from "react";
import { BsBrush } from "react-icons/bs";
import './Navbar.css';
import { Link } from "react-router-dom";

function NavBar() {
    const [isOpen, setMenuOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false); // modal state
    const handleCustomization = () => {alert("Customization options coming soon.");};
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
                {/* Customization button */}
                <button onClick={handleCustomization} className="customize-btn"><BsBrush className="customize-icon" /></button>
        </nav>
        {/* About Modal */}
        {isAboutOpen && (
            <div className="modal-overlay" onClick={toggleAbout}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button onClick={toggleAbout} className="close-btn">X</button>
                    <h2>About Chromophobia</h2>
                    <p>*Explain here*</p>
                </div>
            </div>
        )}
        </>
    );
}

export default NavBar;