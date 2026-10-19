import { describe, expect, it } from 'vitest';
import { isVoiceNonAnswer, VoiceIntakeEpoch } from '../shared/voice-intake.js';
import { buildVoiceDecisionContext } from '../client/voice/decision-context.js';
describe('device intake replay',()=>{
 it('invalidates a late convene when the next microphone turn begins',()=>{
  const gate=new VoiceIntakeEpoch();const assessment=gate.advance();gate.advance();expect(gate.isCurrent(assessment)).toBe(false);
 });
 it('Listening is never an answer; substantive mixed-use reply is',()=>{
  expect(isVoiceNonAnswer('Listening...')).toBe(true);
  expect(isVoiceNonAnswer("It's a mix of all of these, actually.")).toBe(false);
 });
 it('keeps early query and completed clarifiers beyond 12 turns, drops pause filler',()=>{
  const turns=[{id:'q',role:'user' as const,complete:true,text:'Which personal assistant should a company of 20 to 25 people choose?'},...Array.from({length:12},(_,i)=>({id:`a${i}`,role:'sutradhara' as const,complete:true,text:'Is the primary goal productivity, research or coding?'})),{id:'pause',role:'user' as const,complete:true,text:'Listening...'}, {id:'reply',role:'user' as const,complete:true,text:"It's a mix of all of these, actually."}];
  const context=buildVoiceDecisionContext('',turns);expect(context).toContain('Which personal assistant');expect(context).toContain('productivity, research or coding');expect(context).toContain('mix of all');expect(context).not.toContain('Listening');
 });
});

import { acceptsCapturedDecision } from '../shared/voice-intake.js';
it('captured question waits for an explicit answer, not silence or correction',()=>{
 expect(acceptsCapturedDecision('Listening...')).toBe(false);
 expect(acceptsCapturedDecision("It's a mix of all of these, actually.")).toBe(false);
 expect(acceptsCapturedDecision('Yes, but I meant scheduling only.')).toBe(false);
 expect(acceptsCapturedDecision('yes')).toBe(true);
 expect(acceptsCapturedDecision('go ahead')).toBe(true);
});
