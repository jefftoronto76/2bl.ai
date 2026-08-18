/* Tweaks — memory card modes.
   Retypes the memory card currently open in the chat, so the same memory can be
   reviewed as each of the five source types. Spawns a sample card if none is open. */
const HL_KINDS = ['Conversation', 'Photo', 'Video', 'Audio', 'Document'];
const HL_KEY = { Conversation: 'conversation', Photo: 'photo', Video: 'video', Audio: 'audio', Document: 'document' };
const HL_STATES = ['Gathering', 'Draft', 'Saved'];
const HL_STATE_KEY = { Gathering: 'running', Draft: 'draft', Saved: 'saved' };

function HeirloomTweaks() {
  const { values, setTweak } = useTweaks({ kind: 'Conversation', state: 'Draft' });
  const call = (kindLabel, stateLabel) => {
    if (!window.__hlMemoryDemo) return;
    window.__hlMemoryDemo(HL_KEY[kindLabel], stateLabel ? HL_STATE_KEY[stateLabel] : null);
  };
  return (
    <TweaksPanel title="Memory card">
      <TweakSection label="Source type">
        <TweakRadio label="Shown as" value={values.kind} options={HL_KINDS}
          onChange={(v) => { setTweak('kind', v); call(v, null); }} />
      </TweakSection>
      <TweakSection label="Card state">
        <TweakRadio label="State" value={values.state} options={HL_STATES}
          onChange={(v) => { setTweak('state', v); call(values.kind, v); }} />
      </TweakSection>
      <TweakSection label="Demo">
        <TweakButton label="Drop a fresh card" onClick={() => call(values.kind, values.state)} />
        <TweakButton secondary label="Reset conversation" onClick={() => {
          try { localStorage.removeItem('legacy.story.v1'); } catch (e) {}
          location.reload();
        }} />
      </TweakSection>
    </TweaksPanel>
  );
}

(function mountHeirloomTweaks() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  ReactDOM.createRoot(host).render(<HeirloomTweaks />);
})();
