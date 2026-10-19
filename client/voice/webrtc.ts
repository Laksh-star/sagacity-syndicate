export async function waitForIce(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener("icegatheringstatechange", listener);
      resolve();
    }, 5_000);
    const listener = () => {
      if (peer.iceGatheringState === "complete") {
        peer.removeEventListener("icegatheringstatechange", listener);
        clearTimeout(timeout);
        resolve();
      }
    };
    peer.addEventListener("icegatheringstatechange", listener);
  });
}
