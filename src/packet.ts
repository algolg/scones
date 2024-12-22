export interface Packet {
    get packet(): Uint8Array;
}
// this might be completely unnecessary
// frames could store the packet's Uint8Array directly