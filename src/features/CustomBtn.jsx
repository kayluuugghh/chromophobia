import { useState } from "react";
import { BsBrush } from "react-icons/bs";
import '../assets/css/CustomBtn.css';
import { Link } from "react-router-dom";

function CustomBtn() {
    const handleCustomization = () => {alert("Customization options coming soon.");};

    return (
        <>
            <nav className="navbar">
                {/* Customization button */}
                <button onClick={handleCustomization} className="customize-btn"><BsBrush className="customize-icon" /></button>
            </nav>
        </>
    );
}

export default CustomBtn;