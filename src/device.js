"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkController = exports.Device = exports.IdentifiedList = void 0;
const addressing_js_1 = require("./addressing.js");
const arp_js_1 = require("./arp.js");
const frame_js_1 = require("./frame.js");
const interface_js_1 = require("./interface.js");
class IdentifiedList extends Array {
    /**
     * Pushes an IdentifiedItem and sorts the list
     * @param item an IdentifiedItem to add
     * @returns the index of the IdentifiedItem in the sorted list
     */
    push(item) {
        super.push(item);
        super.sort((a, b) => a.compare(b));
        return super.indexOf(item);
    }
    indexOf(item) {
        let start = 0;
        let end = this.length;
        while (start <= end) {
            const mid = Math.trunc((end + start) / 2);
            const comparison = item.compare(this[mid]);
            if (comparison > 0) {
                start = mid + 1;
            }
            else if (comparison < 0) {
                end = mid - 1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }
    exists(item) {
        return this.indexOf(item) != -1;
    }
    indexOfId(id) {
        let start = 0;
        let end = this.length - 1;
        while (start <= end) {
            const mid = Math.trunc((start + end) / 2);
            const comparison = id.compare(this[mid].getId());
            if (comparison > 0) {
                start = mid + 1;
            }
            else if (comparison < 0) {
                end = mid - 1;
            }
            else {
                return mid;
            }
        }
        return -1;
    }
    existsId(id) {
        return this.indexOfId(id) != -1;
    }
    itemFromId(id) {
        return this[this.indexOfId(id)];
    }
}
exports.IdentifiedList = IdentifiedList;
class Device {
    constructor() {
        this._l3infs = [];
        this._l2infs = [];
        let assigned = false;
        while (!assigned) {
            const devid = addressing_js_1.DeviceID.rand();
            const device = new addressing_js_1.DeviceID(devid);
            if (!DeviceList.existsId(device)) {
                this._id = device;
                DeviceList.push(this);
                assigned = true;
            }
        }
    }
    getId() {
        return this._id;
    }
    compare(other) {
        return this._id.compare(other._id);
    }
    encapsulate(packet) {
        const ipv4_dest = packet.dest;
        for (let l3inf of this._l3infs) {
            // check if the subnets match
            if (l3inf.ipv4.and(l3inf.ipv4_prefix).compare(ipv4_dest.and(l3inf.ipv4_prefix)) == 0) {
                // try to get the MAC address of the destination
                const try_mac = this._arp_table.get(ipv4_dest);
                if (try_mac !== undefined) {
                    return new frame_js_1.Frame(try_mac[0], l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet);
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
                    l3inf.find(frame_js_1.EtherType.IPv4, ipv4_dest).then((mac) => {
                        if (mac !== undefined) {
                            /**
                             * current plan: the find function should also add that MAC to the ArpTable
                             * although maybe i'll change my mind
                             */
                            return new frame_js_1.Frame(mac, l3inf.mac, frame_js_1.EtherType.IPv4, packet.packet);
                        }
                    });
                }
            }
        }
        throw "TODO: implement [forward to default gateway]";
    }
    /**
     * Decides whether to forward and/or process the frame
     * @param frame the Frame to process
     * @returns a tuple of booleans for whether to process and whether to forward the frame, respectively
     */
    analyze(frame) {
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
    receive(sentframe) {
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
                case frame_js_1.EtherType.ARP:
                    const packet = arp_js_1.ArpPacket.parsePacket(frame.packet);
                    this.processARP(packet, ingress_mac);
                    break;
                case frame_js_1.EtherType.IPv4:
                    break;
                case frame_js_1.EtherType.IPv6:
                default:
                    break;
            }
        }
        if (forward) {
        }
    }
    // modeled on RFC 826 "Packet Reception"
    processARP(arp_request, ingress_mac) {
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
                case arp_js_1.OP.REQUEST:
                    const new_src_ha = this._l3infs.find((x) => x.ipv4 == arp_request.dest_pa).mac;
                    const arp_reply = arp_request.makeReply(new_src_ha);
                    throw ("send the packet back and return");
                    break;
                case arp_js_1.OP.REPLY:
                    throw ("add entry");
                    break;
            }
        }
    }
}
exports.Device = Device;
let DeviceList = new IdentifiedList();
class NetworkController {
    constructor(device) {
        this._device = device;
    }
    /**
     * Processes a frame by sending it to the device
     * @param frame the frame to process
     */
    receive(frame, ingress_mac) {
        // maybe it should be receive(sentframe: SentFrame) ?
        this._device.receive(new frame_js_1.SentFrame(frame, ingress_mac));
    }
}
exports.NetworkController = NetworkController;
class PersonalComputer extends Device {
    constructor() {
        super();
        this._l3infs.push(new interface_js_1.L3Interface(this.network_controller));
    }
    set ipv4(ipv4) {
        this._l3infs[0].ipv4 = ipv4;
    }
    set ipv4_prefix(ipv4_prefix) {
        this._l3infs[0].ipv4_prefix = ipv4_prefix;
        // console.log(`${this._interfaces[0].ipv4_prefix} - ${this._inf.ipv4_mask}`);
    }
    get inf() {
        return this._l3infs[0];
        ;
    }
}
function main() {
    const pc1 = new PersonalComputer();
    const pc2 = new PersonalComputer();
    interface_js_1.InfMatrix.connect(pc1.inf.mac, pc2.inf.mac);
}
main();
//# sourceMappingURL=device.js.map