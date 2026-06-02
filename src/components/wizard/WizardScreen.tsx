/**
 * WizardScreen — 4-step wizard state machine for rider profile onboarding.
 * Manages step progression, input validation, and profile assembly.
 */
import type React from 'react';
import { useState } from 'react';
import { parseHeight, parseWeight } from '../../lib/conversions.js';
import {
  validateBootSize,
  validateHeightCm,
  validateWeightKg,
  writeProfile,
} from '../../lib/profile.js';
import type { RiderProfile } from '../../types/profile.js';
import { BootSizeStep } from './BootSizeStep.js';
import { HeightStep } from './HeightStep.js';
import { RidingStyleStep } from './RidingStyleStep.js';
import { WeightStep } from './WeightStep.js';
import { WizardCard } from './WizardCard.js';

interface WizardScreenProps {
  onComplete: (profile: RiderProfile) => void;
}

export function WizardScreen({
  onComplete,
}: WizardScreenProps): React.JSX.Element {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);
  const [bootSize, setBootSize] = useState<number>(0);
  const [heightCm, setHeightCm] = useState<number>(0);
  const [weightKg, setWeightKg] = useState<number>(0);

  function handleBootSize(raw: string): void {
    const v = parseFloat(raw);
    if (!validateBootSize(v)) {
      setError('Boot size must be a number between 4.0 and 18.0');
      return;
    }
    setError(null);
    setBootSize(v);
    setStep(2);
  }

  function handleHeight(raw: string): void {
    const cm = parseHeight(raw);
    if (!validateHeightCm(cm)) {
      setError(
        'Enter height as 5\'10" or 178 — must be between 4\'0" and 8\'2"',
      );
      return;
    }
    setError(null);
    setHeightCm(cm);
    setStep(3);
  }

  function handleWeight(raw: string): void {
    const kg = parseWeight(raw);
    if (!validateWeightKg(kg)) {
      setError('Enter weight in lbs between 66 and 440');
      return;
    }
    setError(null);
    setWeightKg(kg);
    setStep(4);
  }

  function handleRidingStyle(value: string): void {
    const profile: RiderProfile = {
      bootSize,
      heightCm,
      weightKg,
      ridingStyle: value,
    };
    writeProfile(profile);
    onComplete(profile);
  }

  return (
    <WizardCard step={step} error={error}>
      {step === 1 && <BootSizeStep onSubmit={handleBootSize} />}
      {step === 2 && <HeightStep onSubmit={handleHeight} />}
      {step === 3 && <WeightStep onSubmit={handleWeight} />}
      {step === 4 && <RidingStyleStep onChange={handleRidingStyle} />}
    </WizardCard>
  );
}
