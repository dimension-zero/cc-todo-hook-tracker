import React, { useEffect, useRef, useState } from 'react';
import ClaudeLogo from '../../assets/ClaudeLogo.png';

export const LOGO_RADIUS = 100; // Export for use in BoidSystem

export const AnimatedBackground: React.FC = () => {
  const [throbSpeed, setThrobSpeed] = useState(4);
  const [rotationSpeed, setRotationSpeed] = useState(30);
  const [currentThrob, setCurrentThrob] = useState(1);
  const [currentRotation, setCurrentRotation] = useState(0);
  const animationFrameRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());
  const throbPhaseRef = useRef<number>(0);
  const rotationPhaseRef = useRef<number>(0);

  // Generate log-normal distributed random number
  const randomLogNormal = (mean: number, stdDev: number): number => {
    const normal = (Math.random() - 0.5) * 2 * stdDev + mean;
    return Math.exp(normal);
  };

  // Generate normal distributed random number (Box-Muller transform)
  const randomNormal = (mean: number, stdDev: number): number => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return z0 * stdDev + mean;
  };

  // Update animation speeds stochastically
  const updateSpeeds = () => {
    // Occasionally update throb speed (log-normal distribution)
    if (Math.random() < 0.02) { // 2% chance per frame
      const newThrobSpeed = randomLogNormal(1.2, 0.3); // Mean ~3.3s, varies from 1s to 10s
      setThrobSpeed(Math.min(10, Math.max(1, newThrobSpeed)));
    }

    // Occasionally update rotation speed (normal distribution)
    if (Math.random() < 0.02) { // 2% chance per frame
      const newRotationSpeed = randomNormal(20, 10); // Mean 20s, std dev 10s
      setRotationSpeed(Math.min(60, Math.max(5, Math.abs(newRotationSpeed))));
    }
  };

  // Animation loop
  const animate = () => {
    const now = Date.now();
    const deltaTime = (now - lastUpdateRef.current) / 1000; // Convert to seconds
    lastUpdateRef.current = now;

    // Update throb
    throbPhaseRef.current += (deltaTime / throbSpeed) * Math.PI * 2;
    const throbScale = 1 + Math.sin(throbPhaseRef.current) * 0.1; // 10% scale variation
    setCurrentThrob(throbScale);

    // Update rotation
    rotationPhaseRef.current += (deltaTime / rotationSpeed) * 360;
    setCurrentRotation(rotationPhaseRef.current % 360);

    // Update speeds stochastically
    updateSpeeds();

    animationFrameRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [throbSpeed, rotationSpeed]);

  return (
    <div 
      className="animated-background-logo"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${currentThrob}) rotate(${currentRotation}deg)`,
        width: '200px',
        height: '200px',
        backgroundImage: `url(${ClaudeLogo})`,
        backgroundSize: 'contain',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        opacity: 0.04,
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'none', // No CSS transitions, we're animating manually
      }}
    />
  );
};