import React, { useEffect, useState, useRef } from 'react';
import ClaudeLogo from '../../assets/ClaudeLogo.png';

interface SplashScreenProps {
  loadingSteps: string[];
  isComplete: boolean;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ loadingSteps, isComplete }) => {
  const [rotationSpeed, setRotationSpeed] = useState(2); // Initial spin duration in seconds
  const [visibleSteps, setVisibleSteps] = useState<string[]>([]);
  const stepsContainerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();
  const startTimeRef = useRef<number>(Date.now());
  
  // Add loading steps progressively
  useEffect(() => {
    if (loadingSteps.length > visibleSteps.length) {
      const newSteps = loadingSteps.slice(visibleSteps.length);
      newSteps.forEach((step, index) => {
        setTimeout(() => {
          setVisibleSteps(prev => [...prev, step]);
        }, index * 50); // Stagger appearance
      });
    }
  }, [loadingSteps, visibleSteps.length]);
  
  // Auto-scroll to bottom when new steps are added
  useEffect(() => {
    if (stepsContainerRef.current) {
      stepsContainerRef.current.scrollTop = stepsContainerRef.current.scrollHeight;
    }
  }, [visibleSteps]);
  
  // Decelerate spinning when complete
  useEffect(() => {
    if (isComplete) {
      const decelerate = () => {
        setRotationSpeed(prev => {
          const newSpeed = prev * 1.15; // Slow down exponentially
          if (newSpeed > 30) {
            // Stop animation when very slow
            if (animationRef.current) {
              cancelAnimationFrame(animationRef.current);
            }
            return 1000; // Effectively stopped
          }
          animationRef.current = requestAnimationFrame(decelerate);
          return newSpeed;
        });
      };
      
      animationRef.current = requestAnimationFrame(decelerate);
    }
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isComplete]);
  
  // Calculate throb based on time
  const getThrobScale = () => {
    const elapsed = (Date.now() - startTimeRef.current) / 1000;
    return 1 + Math.sin(elapsed * 2) * 0.1; // Throb at 2Hz with 10% scale variation
  };
  
  const [throbScale, setThrobScale] = useState(1);
  
  // Update throb animation
  useEffect(() => {
    const updateThrob = () => {
      setThrobScale(getThrobScale());
      requestAnimationFrame(updateThrob);
    };
    const frame = requestAnimationFrame(updateThrob);
    return () => cancelAnimationFrame(frame);
  }, []);
  
  return (
    <div className="splash-screen">
      <div className="splash-logo">
        <img 
          src={ClaudeLogo} 
          alt="Claude" 
          className="claude-logo"
          style={{
            animation: `spin ${rotationSpeed}s linear infinite`,
            transform: `scale(${throbScale})`,
            transition: 'transform 0.1s ease-out'
          }}
        />
      </div>
      <div className="splash-text">Loading projects...</div>
      <div className="loading-steps-container" ref={stepsContainerRef}>
        {visibleSteps.map((step, index) => (
          <div 
            key={index} 
            className="loading-step"
          >
            <span className="step-indicator">▸</span> {step}
          </div>
        ))}
      </div>
    </div>
  );
};