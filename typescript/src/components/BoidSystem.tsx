import React, { useEffect, useRef, useState } from 'react';
import ClaudeLogo from '../../assets/ClaudeLogo.png';
import { LOGO_RADIUS } from './AnimatedBackground';

// Base configuration constants
const BOID_CONFIG_BASE = {
  MAX_BOIDS: 10,
  MIN_BOID_SIZE: 30,
  MAX_BOID_SIZE: 50,
  SPAWN_PROBABILITY_BASE: 1.0, // 100% at flock size 0
  SPAWN_PROBABILITY_DECAY: 0.15, // Exponential decay factor
  DETACH_PROBABILITY_MAX: 0.02, // 2% per frame at flock size 10+
  DETACH_PROBABILITY_SCALE: 0.002, // Linear increase per boid
  BOID_SPEED: 0.5,
  BOID_ACCELERATION: 0.02,
  ALIGNMENT_RADIUS: 150,
  COHESION_RADIUS: 100,
  SEPARATION_RADIUS: 50,
  ALIGNMENT_FORCE: 0.05,
  COHESION_FORCE: 0.03,
  SEPARATION_FORCE: 0.1,
  WANDER_FORCE: 0.02,
  EDGE_MARGIN: 100,
  EDGE_TURN_FORCE: 0.05,
  LOGO_BOUNCE_FORCE: 0.15, // Force applied when bouncing off logo
  LOGO_DETECTION_RADIUS: LOGO_RADIUS + 20, // Detection radius for logo collision
};

// Stochastic parameters with mean reversion
class StochasticParameters {
  private baseValues: typeof BOID_CONFIG_BASE;
  private currentValues: typeof BOID_CONFIG_BASE;
  private meanReversionRate = 0.01;
  private volatility = 0.02;

  constructor() {
    this.baseValues = { ...BOID_CONFIG_BASE };
    this.currentValues = { ...BOID_CONFIG_BASE };
  }

  update() {
    // Apply mean-reverting stochastic process to flocking parameters
    const params = ['ALIGNMENT_FORCE', 'COHESION_FORCE', 'SEPARATION_FORCE', 'WANDER_FORCE'] as const;
    
    params.forEach(param => {
      const base = this.baseValues[param];
      const current = this.currentValues[param];
      
      // Ornstein-Uhlenbeck process for mean reversion
      const drift = this.meanReversionRate * (base - current);
      const diffusion = this.volatility * base * (Math.random() - 0.5) * 2;
      
      this.currentValues[param] = Math.max(0, current + drift + diffusion);
    });
    
    // Occasionally make larger jumps
    if (Math.random() < 0.005) { // 0.5% chance
      const param = params[Math.floor(Math.random() * params.length)];
      this.currentValues[param] = this.baseValues[param] * (0.5 + Math.random() * 1.5);
    }
  }

  get() {
    return this.currentValues;
  }
}

const stochasticParams = new StochasticParameters();

interface Boid {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  throbPhase: number;
  throbSpeed: number;
  opacity: number;
  enteringScreen: boolean;
  leavingScreen: boolean;
}

export const BoidSystem: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const boidsRef = useRef<Boid[]>([]);
  const frameRef = useRef<number>();
  const [, forceUpdate] = useState({});

  // Calculate spawn probability based on flock size
  const calculateSpawnProbability = (flockSize: number): number => {
    const config = stochasticParams.get();
    if (flockSize >= config.MAX_BOIDS) return 0;
    return config.SPAWN_PROBABILITY_BASE * Math.exp(-config.SPAWN_PROBABILITY_DECAY * flockSize);
  };

  // Calculate detach probability based on flock size
  const calculateDetachProbability = (flockSize: number): number => {
    const config = stochasticParams.get();
    if (flockSize === 0) return 0;
    return Math.min(config.DETACH_PROBABILITY_MAX, flockSize * config.DETACH_PROBABILITY_SCALE);
  };

  // Check collision with central logo
  const checkLogoCollision = (boid: Boid, centerX: number, centerY: number): boolean => {
    const dx = boid.x - centerX;
    const dy = boid.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < stochasticParams.get().LOGO_DETECTION_RADIUS;
  };

  // Apply bounce force from logo
  const applyLogoBounce = (boid: Boid, centerX: number, centerY: number) => {
    const dx = boid.x - centerX;
    const dy = boid.y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > 0) {
      const config = stochasticParams.get();
      // Normalize and apply bounce force
      const forceX = (dx / distance) * config.LOGO_BOUNCE_FORCE;
      const forceY = (dy / distance) * config.LOGO_BOUNCE_FORCE;
      
      // Apply force with some randomness for natural bouncing
      boid.vx += forceX * (0.8 + Math.random() * 0.4);
      boid.vy += forceY * (0.8 + Math.random() * 0.4);
      
      // Add some spin to the bounce
      if (Math.random() < 0.3) {
        boid.rotationSpeed = (Math.random() - 0.5) * 4;
      }
    }
  };

  // Create a new boid at screen edge
  const createBoid = (): Boid => {
    const container = containerRef.current;
    if (!container) return null!;
    
    const rect = container.getBoundingClientRect();
    const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
    
    let x, y, vx, vy;
    
    switch (edge) {
      case 0: // Top
        x = Math.random() * rect.width;
        y = -50;
        vx = (Math.random() - 0.5) * 2;
        vy = 1 + Math.random();
        break;
      case 1: // Right
        x = rect.width + 50;
        y = Math.random() * rect.height;
        vx = -(1 + Math.random());
        vy = (Math.random() - 0.5) * 2;
        break;
      case 2: // Bottom
        x = Math.random() * rect.width;
        y = rect.height + 50;
        vx = (Math.random() - 0.5) * 2;
        vy = -(1 + Math.random());
        break;
      case 3: // Left
        x = -50;
        y = Math.random() * rect.height;
        vx = 1 + Math.random();
        vy = (Math.random() - 0.5) * 2;
        break;
      default:
        x = rect.width / 2;
        y = rect.height / 2;
        vx = 0;
        vy = 0;
    }
    
    return {
      id: `boid-${Date.now()}-${Math.random()}`,
      x,
      y,
      vx: vx * stochasticParams.get().BOID_SPEED,
      vy: vy * stochasticParams.get().BOID_SPEED,
      size: stochasticParams.get().MIN_BOID_SIZE + Math.random() * (stochasticParams.get().MAX_BOID_SIZE - stochasticParams.get().MIN_BOID_SIZE),
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 2,
      throbPhase: Math.random() * Math.PI * 2,
      throbSpeed: 0.02 + Math.random() * 0.02,
      opacity: 0,
      enteringScreen: true,
      leavingScreen: false,
    };
  };

  // Calculate distance between two boids
  const distance = (b1: Boid, b2: Boid): number => {
    const dx = b1.x - b2.x;
    const dy = b1.y - b2.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Update boid positions and behaviors
  const updateBoids = () => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const boids = boidsRef.current;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Update stochastic parameters
    stochasticParams.update();
    const BOID_CONFIG = stochasticParams.get();
    
    // Spawn new boids
    const spawnProbability = calculateSpawnProbability(boids.length);
    if (Math.random() < spawnProbability / 60) { // Divide by 60 for per-frame probability
      const newBoid = createBoid();
      if (newBoid) {
        boids.push(newBoid);
        console.log('Spawned boid:', newBoid.id, 'Total boids:', boids.length);
      }
    }
    
    // Update each boid
    const boidsToRemove: string[] = [];
    
    boids.forEach(boid => {
      // Update throb and rotation
      boid.throbPhase += boid.throbSpeed;
      boid.rotation += boid.rotationSpeed;
      
      // Occasionally change rotation speed
      if (Math.random() < 0.005) {
        boid.rotationSpeed = (Math.random() - 0.5) * 2;
      }
      
      // Handle entering/leaving animations
      if (boid.enteringScreen) {
        boid.opacity = Math.min(1, boid.opacity + 0.02);
        if (boid.opacity >= 1) {
          boid.enteringScreen = false;
          console.log('Boid fully entered:', boid.id, 'Opacity:', boid.opacity);
        }
      } else if (boid.leavingScreen) {
        boid.opacity = Math.max(0, boid.opacity - 0.02);
        if (boid.opacity <= 0) {
          boidsToRemove.push(boid.id);
          return;
        }
      } else {
        // Check for detachment
        const detachProbability = calculateDetachProbability(boids.length);
        if (Math.random() < detachProbability / 60) {
          boid.leavingScreen = true;
        }
      }
      
      // Skip movement for leaving boids
      if (boid.leavingScreen) {
        boid.x += boid.vx * 2; // Speed up when leaving
        boid.y += boid.vy * 2;
        return;
      }
      
      // Check collision with central logo and bounce
      if (checkLogoCollision(boid, centerX, centerY)) {
        applyLogoBounce(boid, centerX, centerY);
      }
      
      // Flocking behavior
      let alignmentX = 0, alignmentY = 0, alignmentCount = 0;
      let cohesionX = 0, cohesionY = 0, cohesionCount = 0;
      let separationX = 0, separationY = 0;
      
      boids.forEach(other => {
        if (other.id === boid.id || other.leavingScreen) return;
        
        const d = distance(boid, other);
        
        // Alignment
        if (d < BOID_CONFIG.ALIGNMENT_RADIUS) {
          alignmentX += other.vx;
          alignmentY += other.vy;
          alignmentCount++;
        }
        
        // Cohesion
        if (d < BOID_CONFIG.COHESION_RADIUS) {
          cohesionX += other.x;
          cohesionY += other.y;
          cohesionCount++;
        }
        
        // Separation
        if (d < BOID_CONFIG.SEPARATION_RADIUS && d > 0) {
          const diff = BOID_CONFIG.SEPARATION_RADIUS - d;
          separationX += (boid.x - other.x) / d * diff;
          separationY += (boid.y - other.y) / d * diff;
        }
      });
      
      // Apply alignment force
      if (alignmentCount > 0) {
        boid.vx += (alignmentX / alignmentCount - boid.vx) * BOID_CONFIG.ALIGNMENT_FORCE;
        boid.vy += (alignmentY / alignmentCount - boid.vy) * BOID_CONFIG.ALIGNMENT_FORCE;
      }
      
      // Apply cohesion force
      if (cohesionCount > 0) {
        const targetX = cohesionX / cohesionCount;
        const targetY = cohesionY / cohesionCount;
        boid.vx += (targetX - boid.x) * BOID_CONFIG.COHESION_FORCE / 100;
        boid.vy += (targetY - boid.y) * BOID_CONFIG.COHESION_FORCE / 100;
      }
      
      // Apply separation force
      boid.vx += separationX * BOID_CONFIG.SEPARATION_FORCE;
      boid.vy += separationY * BOID_CONFIG.SEPARATION_FORCE;
      
      // Add some random wander
      boid.vx += (Math.random() - 0.5) * BOID_CONFIG.WANDER_FORCE;
      boid.vy += (Math.random() - 0.5) * BOID_CONFIG.WANDER_FORCE;
      
      // Keep boids within screen bounds
      if (boid.x < BOID_CONFIG.EDGE_MARGIN) {
        boid.vx += BOID_CONFIG.EDGE_TURN_FORCE;
      } else if (boid.x > rect.width - BOID_CONFIG.EDGE_MARGIN) {
        boid.vx -= BOID_CONFIG.EDGE_TURN_FORCE;
      }
      
      if (boid.y < BOID_CONFIG.EDGE_MARGIN) {
        boid.vy += BOID_CONFIG.EDGE_TURN_FORCE;
      } else if (boid.y > rect.height - BOID_CONFIG.EDGE_MARGIN) {
        boid.vy -= BOID_CONFIG.EDGE_TURN_FORCE;
      }
      
      // Limit speed
      const speed = Math.sqrt(boid.vx * boid.vx + boid.vy * boid.vy);
      if (speed > BOID_CONFIG.BOID_SPEED * 2) {
        boid.vx = (boid.vx / speed) * BOID_CONFIG.BOID_SPEED * 2;
        boid.vy = (boid.vy / speed) * BOID_CONFIG.BOID_SPEED * 2;
      }
      
      // Update position
      boid.x += boid.vx;
      boid.y += boid.vy;
      
      // Remove if far off screen
      if (boid.x < -200 || boid.x > rect.width + 200 || 
          boid.y < -200 || boid.y > rect.height + 200) {
        boidsToRemove.push(boid.id);
      }
    });
    
    // Remove boids that have left
    boidsRef.current = boids.filter(b => !boidsToRemove.includes(b.id));
    
    forceUpdate({});
    frameRef.current = requestAnimationFrame(updateBoids);
  };

  useEffect(() => {
    console.log('BoidSystem mounted, starting animation');
    frameRef.current = requestAnimationFrame(updateBoids);
    
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="boid-system">
      {/* Debug counter */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        color: 'rgba(255, 255, 255, 0.3)',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: 1000,
        pointerEvents: 'none'
      }}>
        Boids: {boidsRef.current.length}
      </div>
      {boidsRef.current.map(boid => {
        const throbScale = 1 + Math.sin(boid.throbPhase) * 0.1;
        return (
          <div
            key={boid.id}
            className="boid"
            style={{
              left: `${boid.x}px`,
              top: `${boid.y}px`,
              width: `${boid.size}px`,
              height: `${boid.size}px`,
              transform: `translate(-50%, -50%) scale(${throbScale}) rotate(${boid.rotation}deg)`,
              opacity: boid.opacity * 0.05,
              backgroundImage: `url(${ClaudeLogo})`,
            }}
          />
        );
      })}
    </div>
  );
};