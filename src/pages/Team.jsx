import React, {useState} from "react";
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

function TeamMember({ img, alt, name, role }) {
    const [flipped, setFlipped] = useState(false);

    return (
        <div className="team-member">
            <div className={`flip-card ${flipped ? "flipped" : ""}`} onClick={() => setFlipped(!flipped)}>
                <div className="flip-inner">
                    <div className="flip-front">
                        <img src={img} alt={alt} />
                    </div>
                    <div className="flip-back">
                        <h2>{name}</h2>
                        <p>{role}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Team() {
    return (
        <>
            <HelpBtn />
            <div className="teamTitle">
                <h1>Meet the Team</h1>
            </div>

            <div className="team-container">
                <TeamMember img={Pixel} alt="Pixel" name="Pixel" 
                role="Meow" />
                <TeamMember img={Kayla} alt="Kayla Vo" name="Kayla Vo" 
                role="tbd" />
                <TeamMember img={Annabelle} alt="Annabelle Lozano" name="Annabelle Lozano" 
                role="Hi! My name is Annabelle Lozano, and I am a Computer Science major with a minor in Cybersecurity. My primary contribution to this project was backend development and designing the database for Chromophobia. Outside of school, I enjoy listening to music, playing with my dog, and performing on the oboe in local orchestras. I have a strong passion for space and will be starting my Master’s in Electrical Engineering this fall." />
                <TeamMember img={Drishya} alt="Drishya Regmi" name="Drishya Regmi" 
                role="Hi! My name is Drishya Regmi and i’m a computer science major. My contributions to Chromophobia were in frontend and UI design and development. Some activities I enjoy include watching movies/shows, painting, reading, and pampering my cat Pixel (our mascot)! I will be continuing my education as a master's student in Data Science this fall 2026." />
                <TeamMember img={Bea} alt="Bea Gallardo" name="Bea Gallardo" 
                role="I'm a Computer Science major at University of Houston - Clear Lake. I played a supportive role in Chromophobia's UI/UX and Visualization design and implementation, combining my creative interests with mine and the team's skills in programming. Chromophobia was a valuable experience in combining my skills and my interests. My hobbies are writing, drawing, and playing video games. I hope to make my own video games some day, continuing to combine my skills and interests!" />
                <TeamMember img={Carlos} alt="Carlos Mendoza" name="Carlos Mendoza" 
                role="tbd" />
                <TeamMember img={David} alt="David Gebhart" name="David Gebhart" 
                role="I’m a Computer Science student focused on software development and systems programming. For this project, I’ve worked on assisting with core features, debugging, and improving overall structure and performance. This project has been a great opportunity to combine creativity with software design. Outside of school, I play rugby, drums, and enjoy staying active. I’m working toward a career in software engineering where I can build impactful and scalable technology." />
                <TeamMember img={Will} alt="Will Pereira" name="Will Pereira" 
                role="tbd" />
            </div>
        </>
    );
}

export default Team;