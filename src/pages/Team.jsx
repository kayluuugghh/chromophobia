import React from "react";
import '../assets/css/Team.css';
import HelpBtn from "../features/HelpBtn.jsx";
import Pixel from '../assets/images/Pixel2.jpg';
import Kayla from '../assets/images/Kayla.jpg';
import Annabelle from '../assets/images/Annabelle.jpg';
import Drishya from '../assets/images/Drishya.jpg';
import Bea from '../assets/images/Bea.jpg';
import Carlos from '../assets/images/Carlos.jpg';
import David from '../assets/images/David.jpg';
import Will from '../assets/images/Will.jpg';

function Team() {
    return (
        <>
            <HelpBtn />
            <div className="teamTitle">
                <h1>Meet the Team</h1>
            </div>
            
            <div className="team-container">
                <div className="team-member">
                    <button>
                        <img src={Pixel}alt="Pixel" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Kayla} alt="Kayla Vo" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Annabelle} alt="Annabelle Lozano" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Drishya} alt="Drishya Regmi" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Bea} alt="Bea Gallardo" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Carlos} alt="Carlos Mendoza" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={David} alt="David Gebhart" />
                    </button>
                </div>
                <div className="team-member">
                    <button>
                        <img src={Will} alt="Will Pereira" />
                    </button>
                </div>
            </div>
        </>
    );
}

export default Team;