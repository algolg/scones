import { Ipv4Address, MacAddress, concat, divide, spread } from "../addressing.js";
import { EtherType } from "../frame.js";
import { L3Interface } from "../interface.js";
import { Packet } from "../packet.js";

export enum HTYPE { ETHERNET = 1 }
// enum PTYPE { IPv4 = 0x0800 }
export enum OP { REQUEST = 1, REPLY };

export class ArpPacket implements Packet {
    private readonly _htype: HTYPE;
    private readonly _ptype: EtherType;
    private readonly _hlen = MacAddress.byteLength;
    private readonly _plen = Ipv4Address.byteLength;
    private readonly _op: OP;
    private readonly _src_ha: MacAddress;
    private readonly _src_pa: Ipv4Address;
    private readonly _dest_ha: MacAddress;
    private readonly _dest_pa: Ipv4Address;
    private readonly _packet: Uint8Array;
    private static readonly _lengths: number[] = [16, 16, 8, 8, 16, 48, 32, 48, 32];

    public constructor(op: OP, src_ha: MacAddress, src_pa: Ipv4Address, dest_ha: MacAddress = MacAddress.broadcast, dest_pa: Ipv4Address) {
        this._htype = HTYPE.ETHERNET;
        this._ptype = EtherType.IPv4;
        this._op = op;
        this._src_ha = src_ha;
        this._src_pa = src_pa;
        this._dest_ha = dest_ha;
        this._dest_pa = dest_pa;
        this._packet = concat(
            new Uint8Array(spread(
                [this._htype, ArpPacket._lengths[0]], [this._ptype, ArpPacket._lengths[1]],
                [this._hlen, ArpPacket._lengths[2]], [this._plen, ArpPacket._lengths[3]], [this._op, ArpPacket._lengths[4]]
            )),
            this._src_ha.value, this._src_pa.value,
            this._dest_ha.value, this._dest_pa.value
        )
    }

    public get ptype(): EtherType {
        return this.ptype;
    }

    public get op(): OP {
        return this._op;
    }

    public get src_ha(): MacAddress {
        return this._src_ha;
    }

    public get src_pa(): Ipv4Address {
        return this._src_pa;
    }

    public get dest_ha(): MacAddress {
        return this._dest_ha;
    }

    public get dest_pa(): Ipv4Address {
        return this._dest_pa;
    }

    public get packet(): Uint8Array {
        return this._packet;
    }
    
    public static parsePacket(packet: Uint8Array): ArpPacket {
        const divided: number[] = divide(packet, this._lengths);
        const op = divided[4];
        const sh_arr = spread([divided[5], 48]);
        const sp_arr = spread([divided[6], 32]);
        const dh_arr = spread([divided[7], 48]);
        const dp_arr = spread([divided[8], 32]);
        const src_ha = new MacAddress([sh_arr[0], sh_arr[1], sh_arr[2], sh_arr[3], sh_arr[4], sh_arr[5]]);
        const src_pa = new Ipv4Address([sp_arr[0], sp_arr[1], sp_arr[2], sp_arr[3]]);
        const dest_ha = new MacAddress([dh_arr[0], dh_arr[1], dh_arr[2], dh_arr[3], dh_arr[4], dh_arr[5]]);
        const dest_pa = new Ipv4Address([dp_arr[0], dp_arr[1], dp_arr[2], dp_arr[3]]);
        return new ArpPacket(op, src_ha, src_pa, dest_ha, dest_pa);
    }

    public printPacket() {
        console.log(this._packet.toHex());
    }

    /**
     * Creates a reply ARP packet from the current packet
     * @param new_src_ha the replying device's MAC address (i.e. the MAC address which the requesting device seeks)
     * @returns the reply ARP packet
     */
    public makeReply(new_src_ha: MacAddress): ArpPacket {
        return new ArpPacket(OP.REPLY, new_src_ha, this.dest_pa, this.src_ha, this.src_pa);
    }
}

export class ArpTable {
    private _local_infs: Ipv4Address[] = [];
    private _table: Map<string,[MacAddress, MacAddress]> = new Map();

    private keyToString(ethertype: EtherType, ip: Ipv4Address): string {
        return `${ethertype}${ip}`;
    }

    public setLocalInfs(...l3infs: L3Interface[]) {
        l3infs.forEach((l3inf) => this._local_infs.push(l3inf.ipv4));
    }

    public set(ip: Ipv4Address, remote_mac: MacAddress, local_mac: MacAddress) {
        console.log(`!! ${local_mac}: adding ${ip} (${remote_mac}) to my ARP table`)
        this._table.set(this.keyToString(ip.ethertype, ip), [remote_mac, local_mac]);
    }
    public delete(ip: Ipv4Address): boolean {
        return this._table.delete(this.keyToString(ip.ethertype, ip));
    }
    
    /**
     * Returns an ARP table entry for a given IP address
     * @param ip the IP address to get the ARP entry of
     * @returns (remote MAC, local MAC) pair, if one exists. undefined otherwise
     */
    public get(ip: Ipv4Address): [MacAddress, MacAddress] {
        if (this._local_infs.some((inf) => inf !== undefined && inf.compare(ip) == 0)) {
            return [MacAddress.loopback, MacAddress.loopback];
        }
        return this._table.get(this.keyToString(ip.ethertype, ip));
    }
    public has(ip: Ipv4Address): boolean {
        return this._table.has(this.keyToString(ip.ethertype, ip));
    }

    public clearValue(egress: MacAddress): number {
        let toClear: string[] = [];
        for (let [key, value] of this._table.entries()) {
            if (value[1].compare(egress) == 0) {
                toClear.push(key);
            }
        }
        for (let destination of toClear) {
            this._table.delete(destination);
        }
        return toClear.length;
    }

}