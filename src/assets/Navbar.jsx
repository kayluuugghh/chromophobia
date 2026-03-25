import { useState } from "react";
import { BsBrush } from "react-icons/bs";
import './Navbar.css';
import { Link } from "react-router-dom";

function NavBar() {
    const [isOpen, setIsOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false); // modal state
    const toggleMenu = () => {setIsOpen(!isOpen);};
    const handleCustomization = () => {alert("Customization options coming soon.");};
    const toggleAbout = () => {setIsAboutOpen(!isAboutOpen);};

    return (
        <>
        <nav className="navbar">

            {/* 3 stacked bars to create hamburger icon */}
            <div className= "hamburger" onClick={toggleMenu}>
                <div className="bar"></div>
                <div className="bar"></div>
                <div className="bar"></div>
            </div>

            {/* navigation links  */}
            <ul className={`nav-links ${isOpen ? "open" : ""}`}>
                <li><Link to="/">Home</Link></li>
                <li><a onClick={toggleAbout} className="link-btn">About</a></li>
                <li><Link to="/team">Team</Link></li>
            </ul>
            
            {/* Customization button */}
            <button onClick={handleCustomization} className="customize-btn"><BsBrush className="customize-icon" /></button>

        </nav>
        {/* About Modal */}
        {isAboutOpen && (
            <div className="modal-overlay" onClick={toggleAbout}>
                <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <h2>About Chromophobia</h2>
                    <p>*Explain here*</p>
                    <button onClick={toggleAbout} className="close-btn">X</button>
                </div>
            </div>
        )}
        </>
    );
}

export default NavBar;