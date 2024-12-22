import { Ipv4Address, Identifier, DeviceID, MacAddress } from "./addressing.js";
import { ArpPacket, ArpTable, OP } from "./arp.js";
import { ForwardingInformationBase } from "./forwarding.js";
import { EtherType, Frame, SentFrame } from "./frame.js";
import { InfMatrix, L2Interface, L3Interface } from "./interface.js";
import { Ipv4Packet } from "./ip.js";

export interface IdentifiedItem {
    getId(): Identifier;
    compare(other: this): number;
}

export class IdentifiedList<T extends IdentifiedItem> extends Array<T> {
    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item an IdentifiedItem to add
     * @returns the index of the IdentifiedItem in the sorted list
     */
    public push(item: T): number {
        super.push(item);
        super.sort((a,b) => a.compare(b))
        return super.indexOf(item);
    }

    public indexOf(item: T): number {
        let start = 0;
        let end = this.length;
        while (start <= end) {
            const mid = Math.trunc((end+start)/2);
            const comparison = item.compare(this[mid]);
            if (comparison > 0) {
                start = mid+1;
            }
            else if (comparison < 0) {
                end = mid-1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }

    public exists(item: T): boolean {
        return this.indexOf(item) != -1;
    }

    public indexOfId(id: Identifier): number {
        let start = 0;
        let end = this.length - 1;
        while (start <= end) {
            const mid = Math.trunc((start+end)/2);
            const comparison = id.compare(this[mid].getId());
            if (comparison > 0) {
                start = mid+1;
            }
            else if (comparison < 0) {
                end = mid-1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }

    public existsId(id: Identifier): boolean {
        return this.indexOfId(id) != -1;
    }

    public itemFromId(id: Identifier): T {
        return this[this.indexOfId(id)];
    }
}

export class Device implements IdentifiedItem {
    private _id: DeviceID;
    private _forwarding_table: ForwardingInformationBase;
    private _arp_table: ArpTable;
    // private _routing_table: RoutingTable; (once implemented, the default gateway/route will go here)
    protected network_controller: NetworkController;
    protected _l3infs: L3Interface[] = [];
    protected _l2infs: L2Interface[] = [];

    public constructor() {
        let assigned = false;
        while (!assigned) {
            const devid = DeviceID.rand();
            const device = new DeviceID(devid)
            if (!DeviceList.existsId(device)) {
                this._id = device;
                DeviceList.push(this);
                assigned = true;
            }
        }
    }

    public getId(): Readonly<DeviceID> {
        return this._id;
    }

    public compare(other: this): number {
        return this._id.compare(other._id);
    }

    public encapsulate(packet: Ipv4Packet): Frame {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // check if the subnets match
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    return new Frame(try_mac[0], l3inf.mac, EtherType.IPv4, packet.packet);
                }
                // if the MAC address is not in the ARP table,
                else {
                    // send an ARP request, then forward the frame
                    /**
                     * Note: technically, the original packet would be thrown away, and the
                     * application is supposed to retransmit it after the ARP request is
                     * resolved. However, I'm instead combining these two steps such that
                     * the packet is cached and sent immediately after the ARP request's
                     * resolution.
                     */
                    l3inf.find(EtherType.IPv4, ipv4_dest).then((mac) => {
                        if (mac !== undefined) {
                            /**
                             * current plan: the find function should also add that MAC to the ArpTable
                             * although maybe i'll change my mind
                             */
                            return new Frame(mac, l3inf.mac, EtherType.IPv4, packet.packet);
                        }
                    });
                }
            }
        }
        throw "TODO: implement [forward to default gateway]"
    }

    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans for whether to process and whether to forward the frame, respectively
     */
    private analyze(frame: Frame): [boolean, boolean] {
        let forward = true;
        let process = false;

        // if this device has the frame's destination MAC address, *do not* forward the frame
        // if this device has the frame's destination MAC address, *do* process the frame
        if (this._l2infs.some((x) => x.getId() == frame.dest_mac) || this._l3infs.some((x) => x.getId() == frame.dest_mac)) {
            forward = false;
            process = true;
        }

        // if the frame was broadcasted, *do* process the frame
        if (frame.dest_mac.toArray().every((x) => x == 0xFF)) {
            process = true;
        }

        return [process, forward];
    }

    public receive(sentframe: SentFrame) {
        const frame = sentframe.frame;
        const ingress_mac = sentframe.ingress_mac;
        const ethertype = frame.ethertype;
        const [process, forward] = this.analyze(frame);

        this._forwarding_table.set(frame.dest_mac, ingress_mac);
        /**
         * Currently, processing happens before forwarding. Consider whether this is the best option.
         * To allow for Per-Hop Behaviors, this order appears to make the most sense.
         */
        if (process) {
            switch (ethertype) {
                case EtherType.ARP:
                    const packet = ArpPacket.parsePacket(frame.packet);
                    this.processARP(packet, ingress_mac);
                    break;
                case EtherType.IPv4:
                    break;
                case EtherType.IPv6:
                default:
                    break;
            }
        }
        if (forward) {

        }
    }

    // modeled on RFC 826 "Packet Reception"
    private processARP(arp_request: ArpPacket, ingress_mac: MacAddress) {
        const op = arp_request.op;
        const src_mac = arp_request.src_ha;
        const dest_mac = arp_request.dest_ha;
        // skipped check for Ethernet and IPv4 support (returns true)
        let merge = false;
        if (this._arp_table.has(arp_request.src_pa)) {
            this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            merge = true;
        }
        if (this._l3infs.some((x) => x.ipv4 == arp_request.dest_pa)) {
            if (!merge) {
                this._arp_table.set(arp_request.src_pa, arp_request.src_ha, ingress_mac);
            }
            switch (op) {
                case OP.REQUEST:
                    const new_src_ha = this._l3infs.find((x) => x.ipv4 == arp_request.dest_pa).mac;
                    const arp_reply = arp_request.makeReply(new_src_ha);
                    throw("send the packet back and return");
                    break;
                case OP.REPLY:
                    throw("add entry");
                    break;
            }

        }
    }

}
let DeviceList = new IdentifiedList<Device>();

export class NetworkController {
    private _device: Device;

    public constructor(device: Device) {
        this._device = device;
    }

    /**
     * Processes a frame by sending it to the device
     * @param frame the frame to process
     */
    public receive(frame: Frame, ingress_mac: MacAddress) {
        // maybe it should be receive(sentframe: SentFrame) ?
        this._device.receive(new SentFrame(frame, ingress_mac));
    }
}

class PersonalComputer extends Device {
    private _default_gateway: Ipv4Address;

    public constructor() {
        super();
        this._l3infs.push(new L3Interface(this.network_controller));
    }

    public set ipv4(ipv4: Ipv4Address) {
        this._l3infs[0].ipv4 = ipv4;
    }

    public set ipv4_prefix(ipv4_prefix: number) {
        this._l3infs[0].ipv4_prefix = ipv4_prefix;
        // console.log(`${this._interfaces[0].ipv4_prefix} - ${this._inf.ipv4_mask}`);
    }

    public get inf(): L3Interface {
        return this._l3infs[0];;
    }
}

function main() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    InfMatrix.connect(pc1.inf.mac, pc2.inf.mac);
}
main();