import { useState, useEffect } from 'react';
import pixel from '../assets/images/pixel.png';
import '../assets/css/Follower.css';

function Follower() {
    const [pixelPosition, setPixelPosition] = useState({ x: 0, y: 0 });
    const [facingLeft, setFacingLeft] = useState(false);

    useEffect(() => {
        let lastX = 0;

        function movePixel(e) {
            setPixelPosition({ x: e.clientX, y: e.clientY }); 

            if (e.clientX < lastX) {
                setFacingLeft(true);
            } else if (e.clientX > lastX) {
                setFacingLeft(false);
            }
            lastX = e.clientX;
        };

        window.addEventListener('mousemove', movePixel);
        return () => {
            window.removeEventListener('mousemove', movePixel);
        };
    }, []);

    return (
        <img 
            src={pixel} 
            alt="Cat" 
            className="pixel"
            style={{ 
                left: pixelPosition.x + 'px', 
                top: pixelPosition.y + 'px',
                transform: facingLeft
                    ? 'translate(-50%, -50%) scaleX(-1)'
                    : 'translate(-50%, -50%) scaleX(1)',
            }}
        />
    );
}

export default Follower;