/** @vitest-environment jsdom */
import { act } from 'react';import { createRoot } from 'react-dom/client';import { expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({session:null,readiness:vi.fn(),materiality:vi.fn(),stream:vi.fn(),commentary:[],appends:[]}));
vi.mock('../client/api',()=>({assessVoiceReadiness:state.readiness,streamDeliberation:state.stream,recordLiveDiagnostic:vi.fn(),assessVoiceInterruption:state.materiality,interruptDeliberation:vi.fn(),recoverDecisionHistory:vi.fn()}));
vi.mock('../client/voice/live-session',()=>({LiveVoiceSession:class extends EventTarget{constructor(){super();state.session=this;}async connect(){this.dispatchEvent(new Event('ready'));}appendInstructions(s,id){state.appends.push({kind:'instructions',content:s,delegationId:id});return 'i';}appendThinking(s,id){state.appends.push({kind:'thinking',content:s,delegationId:id});return 't';}appendCommentary(s,id){state.commentary.push(s);state.appends.push({kind:'commentary',content:s,delegationId:id});return 'c';}close(){}setTalking(a){this.dispatchEvent(new CustomEvent('talking',{detail:a}));}}}));
import App from '../client/App.js';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
if (!globalThis.Audio?.prototype.play?.mock) { globalThis.Audio = vi.fn(function(){ return {play:vi.fn().mockResolvedValue(undefined),pause:vi.fn(),currentTime:0}; }); }

it('replays exact completed query, blocks stale convene on Listening/new speech, confirms mixed-use question before start',async()=>{
 localStorage.clear();state.stream.mockResolvedValue(undefined);let finish;
 state.readiness.mockImplementationOnce(()=>new Promise(r=>finish=r)).mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear choice.',confidence:.9,decisionQuestion:'Which personal AI assistant should a 20-25 person company adopt for productivity, research and coding?'});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(<App/>));const button=Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice'));await act(async()=>button.click());
 const turn=async(id,text,role='user')=>act(async()=>{const x={id,role,text,complete:true};state.session.dispatchEvent(new CustomEvent('turn',{detail:x}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:x}));});
 await turn('1',"There's so many personal AI assistants right now, like Muse, Web Instinct, like bots, et cetera.");
 await act(async()=>{state.session.setTalking(true);state.session.setTalking(false);});
 await turn('2','So, which ones should...');await turn('3','A small company of 20 to 25 people should adopt.');
 await act(async()=>{finish({action:'convene',missingInformation:[],reason:'old',confidence:.9});});
 await turn('a','Could you share the primary goal for the assistant, like boosting productivity, handling research, coding, or something else?','sutradhara');
 expect(state.readiness.mock.calls.length).toBeGreaterThan(1);expect(state.readiness.mock.calls[0][1].aborted).toBe(true); const calls=state.readiness.mock.calls.length;await turn('pause','Listening...');expect(state.readiness.mock.calls.length).toBe(calls);expect(state.stream).not.toHaveBeenCalled();
 await turn('mix',"It's a mix of all of these, actually.");expect(state.stream).not.toHaveBeenCalled();expect(container.textContent).toContain('Confirm the captured decision');expect(state.commentary.at(-1)).toContain('CAPTURED_DECISION_CONFIRMATION:');
 await turn('yes','yes');expect(state.stream).toHaveBeenCalledTimes(1);const sent=state.stream.mock.calls[0][0];expect(sent.context).toContain('Confirmed decision question: Which personal AI assistant');expect(sent.context).toContain('Muse, Web Instinct');expect(sent.context).toContain('productivity, handling research, coding');expect(sent.context).toContain('mix of all');expect(sent.context).not.toContain('Listening');
 await act(async()=>root.unmount());container.remove();
});
it('does not show Send to council now or Preparing after a failed run', async()=>{
 localStorage.clear();state.readiness.mockReset();state.commentary=[];state.stream.mockReset();state.stream.mockImplementation(async(_request,onEvent)=>onEvent({type:'council.error',message:'Schema repair exhausted.'}));
 state.readiness.mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear.',confidence:.9,decisionQuestion:'Which assistant should we adopt?'});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const emit=async(id,text)=>act(async()=>{const t={id,role:'user',text,complete:true};state.session.dispatchEvent(new CustomEvent('turn',{detail:t}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:t}));});
 await emit('q','Which assistant should our team adopt?');await emit('y','yes');expect(container.textContent).toContain('Schema repair exhausted.');expect(container.textContent).not.toContain('Send to council now');expect(container.textContent).not.toContain('Preparing the council.');await act(async()=>root.unmount());container.remove();
});

it('never acknowledges an empty tap, acknowledges captured speech once, and stops on new speech', async()=>{
 localStorage.clear();state.readiness.mockReset();state.commentary=[];state.stream.mockReset();
 const play=vi.fn().mockResolvedValue(undefined),pause=vi.fn();const audio={play,pause,currentTime:0};const old=globalThis.Audio;globalThis.Audio=vi.fn(function(){return audio;});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const button=container.querySelector('.voice-button');button.setPointerCapture=vi.fn();button.hasPointerCapture=()=>false;
 const pointer=(type)=>{const e=new Event(type,{bubbles:true});Object.assign(e,{pointerId:1,pointerType:'touch',button:0});button.dispatchEvent(e);};
 await act(async()=>{pointer('pointerdown');pointer('pointerup');});expect(play).not.toHaveBeenCalled();
 const empty={id:'empty',role:'user',text:'',complete:true};await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn',{detail:empty}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:empty}));});expect(container.textContent).not.toContain('Listening');expect(container.textContent).not.toContain('Decision captured.');expect(play).not.toHaveBeenCalled();
 state.readiness.mockImplementation(()=>new Promise(()=>{})); const captured={id:'captured',role:'user',text:'Should our team trial an assistant?',complete:true};await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn',{detail:captured}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:captured}));});expect(globalThis.Audio).toHaveBeenCalledWith('/audio/checking-question.wav');expect(play).toHaveBeenCalledTimes(1);
 await act(async()=>state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:captured})));expect(play).toHaveBeenCalledTimes(1);
 const prior=pause.mock.calls.length;await act(async()=>pointer('pointerdown'));expect(pause.mock.calls.length).toBeGreaterThan(prior);expect(audio.currentTime).toBe(0);expect(state.readiness).toHaveBeenCalledTimes(1);expect(state.stream).not.toHaveBeenCalled();
 await act(async()=>root.unmount());container.remove();globalThis.Audio=old;
});

it('keeps captured confirmation intact when native delegation arrives late and binds it only after approval', async()=>{
 localStorage.clear();state.readiness.mockReset();state.stream.mockReset();state.commentary=[];state.appends=[];state.stream.mockResolvedValue(undefined);
 state.readiness.mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear.',confidence:.9,decisionQuestion:'Should our company trial an AI assistant?'});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const question={id:'decision-turn',role:'user',text:'Should our company trial an AI assistant for research and coding?',complete:true};
 await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn',{detail:question}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:question}));});
 expect(container.textContent).toContain('Confirm the captured decision');expect(state.stream).not.toHaveBeenCalled();
 const delegation={id:'item_test',causalTurnId:question.id,offsetMs:1000,causalTurn:question};
 await act(async()=>state.session.dispatchEvent(new CustomEvent('delegation',{detail:delegation})));
 expect(container.textContent).toContain('Confirm the captured decision');expect(state.stream).not.toHaveBeenCalled();
 const yes={id:'approval-turn',role:'user',text:'yes',complete:true};
 await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn',{detail:yes}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:yes}));});
 expect(state.stream).toHaveBeenCalledTimes(1);expect(state.appends.some(entry=>entry.delegationId==='item_test')).toBe(true);
 await act(async()=>root.unmount());container.remove();
});

it('prefers a delegation carried by the confirming turn over the stored decision-turn delegation', async()=>{
 localStorage.clear();state.readiness.mockReset();state.stream.mockReset();state.commentary=[];state.appends=[];state.stream.mockResolvedValue(undefined);
 state.readiness.mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear.',confidence:.9,decisionQuestion:'Should our company trial an AI assistant?'});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const question={id:'decision-turn-own-delegation',role:'user',text:'Should our company trial an AI assistant for research and coding?',complete:true};
 await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn',{detail:question}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:question}));});
 await act(async()=>state.session.dispatchEvent(new CustomEvent('delegation',{detail:{id:'item_first',causalTurnId:question.id,offsetMs:1000,causalTurn:question}})));
 const confirmation={id:'approval-turn-own-delegation',role:'user',text:'yes',complete:true};
 await act(async()=>state.session.dispatchEvent(new CustomEvent('turn',{detail:confirmation})));
 const confirmingDelegation={id:'item_confirm',causalTurnId:confirmation.id,offsetMs:2000,causalTurn:confirmation};
 await act(async()=>state.session.dispatchEvent(new CustomEvent('delegation',{detail:confirmingDelegation})));
 expect(state.stream).toHaveBeenCalledTimes(1);
 const activeStatus=state.appends.find(entry=>entry.kind==='instructions'&&entry.content.includes('status: ACTIVE.'));
 expect(activeStatus?.delegationId).toBe('item_confirm');expect(activeStatus?.delegationId).not.toBe('item_first');
 await act(async()=>{state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:confirmation}));state.session.dispatchEvent(new CustomEvent('delegation',{detail:confirmingDelegation}));});
 expect(state.stream).toHaveBeenCalledTimes(1);
 await act(async()=>root.unmount());container.remove();
});

it('keeps an ambiguous post-decision duration change attached through yes until an exact value is supplied', async()=>{
 localStorage.clear();state.readiness.mockReset();state.materiality.mockReset();state.stream.mockReset();state.commentary=[];state.appends=[];
 state.readiness.mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear.',confidence:.9,decisionQuestion:'Should we run an eight-week channel test?'});
 const scroll={decision:'Run an eight-week channel test.',rationale:'It produces comparable evidence.',forethought:'Protect against channel concentration.',quickaction:'Track qualified meetings weekly.',examiner:'Validate the buyer channel assumption.',triggerToReconvene:'Review after eight weeks.',confidence:.75};
 state.stream.mockImplementation(async(_request,onEvent)=>{onEvent({type:'council.result',scroll,mode:'initial'});});
 state.materiality
  .mockResolvedValueOnce({material:false,reason:'The user may want a shorter duration but supplied no replacement.',confidence:.55})
  .mockResolvedValueOnce({material:true,changedConstraint:'The channel test should last four weeks instead of eight weeks.',reason:'The test duration changed.',confidence:.94});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const emit=async(id,text)=>act(async()=>{const turn={id,role:'user',text,complete:true};state.session.dispatchEvent(new CustomEvent('turn',{detail:turn}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:turn}));});
 await emit('decision','Should we run an eight-week channel test?');await emit('approve','yes');expect(state.stream).toHaveBeenCalledTimes(1);
 await emit('ambiguous','Eight weeks seems too long.');
 expect(state.commentary.at(-1)).toContain('exact replacement value');expect(state.commentary.at(-1)).toContain('Do not ask only whether');
 await emit('yes-change','Yes.');
 expect(state.stream).toHaveBeenCalledTimes(1);expect(state.commentary.at(-1)).toContain('exact replacement value is still missing');expect(state.commentary.at(-1)).toContain('Do not ask another yes-or-no');
 await emit('duration','Make it four weeks.');
 expect(container.textContent).toContain('Material change awaiting confirmation');expect(container.textContent).toContain('four weeks, replacing eight weeks');expect(state.stream).toHaveBeenCalledTimes(1);
 await emit('confirm-duration','Yes.');expect(state.stream).toHaveBeenCalledTimes(2);
 await act(async()=>root.unmount());container.remove();
});

it('confirms every clause in one material turn and reconvenes exactly once', async()=>{
 localStorage.clear();state.readiness.mockReset();state.materiality.mockReset();state.stream.mockReset();state.commentary=[];state.appends=[];
 state.readiness.mockResolvedValue({action:'convene',missingInformation:[],reason:'Clear.',confidence:.9,decisionQuestion:'Should I prioritize LinkedIn or Upwork?'});
 const scroll={decision:'Run a bounded channel pilot.',rationale:'A parallel test produces comparable evidence.',forethought:'Protect limited capacity.',quickaction:'Track qualified leads.',examiner:'Use one success threshold.',triggerToReconvene:'Review after the pilot.',confidence:.78};
 state.stream.mockImplementation(async(_request,onEvent)=>{onEvent({type:'council.result',scroll,mode:'initial'});});
 state.materiality.mockResolvedValue({material:true,changedConstraint:'Available effort is limited to five hours a week.',reason:'The weekly capacity changed.',confidence:.9});
 const container=document.createElement('div');document.body.append(container);const root=createRoot(container);await act(async()=>root.render(<App/>));await act(async()=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes('Start voice')).click());
 const emit=async(id,text)=>act(async()=>{const turn={id,role:'user',text,complete:true};state.session.dispatchEvent(new CustomEvent('turn',{detail:turn}));state.session.dispatchEvent(new CustomEvent('turn.completed',{detail:turn}));});
 await emit('decision','Should I prioritize LinkedIn or Upwork?');await emit('approve','yes');expect(state.stream).toHaveBeenCalledTimes(1);
 const correction='Actually, I can spend only five hours a week and I want the test to be finished in four weeks.';
 await emit('two-constraints',correction);
 expect(container.textContent).toContain('five hours a week');expect(container.textContent).toContain('finished in four weeks');expect(state.stream).toHaveBeenCalledTimes(1);
 await emit('confirm-both','yes');
 expect(state.stream).toHaveBeenCalledTimes(2);expect(state.stream.mock.calls[1][0].changedConstraint).toBe(correction);
 await act(async()=>root.unmount());container.remove();
});
