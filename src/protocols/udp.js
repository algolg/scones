import { concat, divide, limit, spread } from "../addressing.js";
import { InternetProtocolNumbers, Ipv4Packet } from "./ip.js";
export class UdpDatagram {
    constructor(src_address, dest_address, src_port, dest_port, data, checksum) {
        this.checksum = new Uint8Array(2);
        this.src_port = limit(src_port, UdpDatagram._lengths[0]);
        this.dest_port = limit(dest_port, UdpDatagram._lengths[1]);
        this.data = data;
        this.length = UdpDatagram._bytes_before_data + this.data.length;
        let pseudo_header = UdpDatagram.pseudoHeader(this, src_address, dest_address);
        const checksum_num = checksum ?? Ipv4Packet.calculateChecksum(pseudo_header);
        this.checksum = new Uint8Array(spread([checksum_num, UdpDatagram._lengths[3]]));
        this.datagram = concat(this.header, this.data);
    }
    get header() {
        return concat(new Uint8Array(spread([this.src_port, UdpDatagram._lengths[0]], [this.dest_port, UdpDatagram._lengths[1]], [this.length, UdpDatagram._lengths[2]])), this.checksum);
    }
    static pseudoHeader(datagram, src_address, dest_address) {
        return concat(src_address.value, dest_address.value, new Uint8Array([
            0, InternetProtocolNumbers.UDP,
        ]), new Uint8Array(spread([UdpDatagram._bytes_before_data + datagram.data.length, 16], [datagram.src_port, 16], [datagram.dest_port, 16], [datagram.length, 16])), datagram.checksum, datagram.data);
    }
    static verifyChecksum(datagram, src_address, dest_address) {
        let pseudo_header = UdpDatagram.pseudoHeader(datagram, src_address, dest_address);
        return Ipv4Packet.calculateChecksum(pseudo_header) == 0;
    }
    static parse(datagram, src_address, dest_address) {
        const divided = divide(datagram.slice(0, UdpDatagram._bytes_before_data), UdpDatagram._lengths);
        return new UdpDatagram(src_address, dest_address, divided[0], divided[1], datagram.slice(UdpDatagram._bytes_before_data), divided[3]);
    }
}
UdpDatagram._lengths = [16, 16, 16, 16];
UdpDatagram._bytes_before_checksum = 6;
UdpDatagram._bytes_before_data = 8;
//# sourceMappingURL=udp.js.map