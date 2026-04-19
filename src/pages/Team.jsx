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
                        <h2 className="name">{name}</h2>
                        <p className="role">{role}</p>
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
                <h1>THE CHROMOPHOBIA TEAM</h1>
            </div>

            <div className="team-container">
                <TeamMember img={Pixel} alt="Pixel" name="Pixel" 
                role={
                    <>
                    "Meow"
                    <br /><br />
                    Pixel played an integral role in the production of Chromophobia by providing moral support and being the cutest member of the team.
                    </>
                }></TeamMember>
                <TeamMember img={Kayla} alt="Kayla Vo" name="Kayla Vo" 
                role={
                    <>
                    Hi there! My name is Kayla Vo, and I had the honor of serving as Chromophobia's project lead. As the acting manager, my 
                    primary responsibilities consisted of facilitating communication between team members, setting realistic goals and 
                    expectations, and multifaceted troubleshooting. In addition, I contributed in program design and full stack development, 
                    with a focus on front end development and user experience.
                    <br /><br />
                    Outside of academics, some interests of mines consists of dancing, making playlists/DJing, and crocheting!
                    </>
                }></TeamMember>
                <TeamMember img={Annabelle} alt="Annabelle Lozano" name="Annabelle Lozano"
                role={
                    <>
                    Hi! My name is Annabelle Lozano, and I am a Computer Science major with a minor in Cybersecurity. My primary contribution 
                    to this project was backend development and designing the database for Chromophobia. 
                    <br /><br />
                    Outside of school, I enjoy listening to music, playing with my dog, and performing on the oboe in local orchestras. 
                    I have a strong passion for space and will be starting my Master’s in Electrical Engineering this fall.
                    </>
                }></TeamMember>
                <TeamMember img={Drishya} alt="Drishya Regmi" name="Drishya Regmi" 
                role={
                    <>
                    Hi! My name is Drishya Regmi and i’m a computer science major. My contributions to Chromophobia were in frontend and UI design and development. 
                    <br /><br />
                    Some activities I enjoy include watching movies/shows, painting, reading, and pampering my cat Pixel (our mascot)! I will be continuing my education as a master's student in Data Science this fall 2026.
                    </>
                }></TeamMember>
                <TeamMember img={Bea} alt="Bea Gallardo" name="Bea Gallardo" 
                role={
                    <>
                    I'm a Computer Science major at University of Houston - Clear Lake. I played a supportive role in Chromophobia's UI/UX and Visualization design and implementation, combining my creative interests with mine and the team's skills in programming. Chromophobia was a valuable experience in combining my skills and my interests. 
                    <br /><br />
                    My hobbies are writing, drawing, and playing video games. I hope to make my own video games some day, continuing to combine my skills and interests!
                    </>
                }></TeamMember>
                <TeamMember img={Carlos} alt="Carlos Mendoza" name="Carlos Mendoza" 
                role={
                    <>
                    Hey everyone! My name is Carlos Mendoza, an aspiring AI engineer and Computer Science student currently studying at the University of Houston - Clear Lake. I played a part in the AI integration and visualization system for Chromophobia.
                    <br /><br />
                    Some of my outside of school hobbies include exercise, video games and reading philosophy. I plan to start a career in the AI industry with a hope of improving as much as possible from here onward.
                    </>
                }></TeamMember>
                <TeamMember img={David} alt="David Gebhart" name="David Gebhart" 
                role={
                    <>
                    I’m a Computer Science student focused on software development and systems programming. 
                    For this project, I’ve worked on assisting with core features, debugging, and improving overall structure and performance. 
                    This project has been a great opportunity to combine creativity with software design.
                    <br /><br />
                    Outside of school, I play rugby, drums, and enjoy staying active. I’m working toward a career 
                    in software engineering where I can build impactful and scalable technology.
                    </>
                }></TeamMember>
                <TeamMember img={Will} alt="Will Pereira" name="Will Pereira" 
                role="tbd" />
            </div>
        </>
    );
}

export default Team;