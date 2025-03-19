import { ArpPacket, OP } from "../arp.js";
import { EtherType } from "../frame.js";
import { IcmpControlMessage, IcmpDatagram, IcmpUnreachableCode } from "../icmp.js";
import { InternetProtocolNumbers, Ipv4Packet } from "../ip.js";
import { Protocol } from "../socket.js";
export function getExplanation(frame) {
    const ethertype = frame.ethertype;
    let explanation = "";
    let protocol;
    if (ethertype <= EtherType.IEEE802dot3_Upper) {
    }
    else if (ethertype == EtherType.ARP) {
        protocol = Protocol.ARP;
        const packet = ArpPacket.parsePacket(frame.packet);
        switch (packet.op) {
            case OP.REQUEST:
                explanation = `Device ${packet.src_pa} (${packet.src_ha}) is requesting the MAC address associated with the IPv4 address ${packet.dest_pa}`;
                break;
            case OP.REPLY:
                explanation = `Device ${packet.src_pa} (${packet.src_ha}) is letting device ${packet.dest_pa} (${packet.dest_ha}) know its MAC address`;
                break;
            default:
                explanation = "ARP Packet with unknown operation";
                break;
        }
    }
    else if (ethertype == EtherType.IPv4) {
        protocol = Protocol.IPv4;
        const packet = Ipv4Packet.parsePacket(frame.packet);
        switch (packet.protocol) {
            case InternetProtocolNumbers.ICMP:
                protocol = Protocol.ICMP;
                explanation = getICMPExplanation(packet);
                break;
        }
    }
    return [protocol, explanation];
}
function getICMPExplanation(packet) {
    const icmp_datagram = IcmpDatagram.parse(packet.data);
    let explanation = "";
    const type = icmp_datagram.type;
    const code = icmp_datagram.code;
    switch (type) {
        case IcmpControlMessage.ECHO_REQUEST:
            explanation = `Device ${packet.src} is attempting to reach ${packet.dest}`;
            break;
        case IcmpControlMessage.ECHO_REPLY:
            explanation = `Device ${packet.src} is responding to ${packet.dest}'s request`;
            break;
        case IcmpControlMessage.TIME_EXCEEDED:
            explanation = `Device ${packet.src} is informing ${packet.dest} that their request expired in transit`;
            break;
        case IcmpControlMessage.UNREACHABLE:
            switch (code) {
                case IcmpUnreachableCode.HOST:
                    explanation = `Device ${packet.src} is informing ${packet.dest} that their request cannot be forwarded because the destination host could not be found`;
                    break;
                case IcmpUnreachableCode.NET:
                    explanation = `Device ${packet.src} is informing ${packet.dest} that their request cannot be forwarded because no route to the destination network was found`;
                    break;
            }
            break;
        default:
            explanation = "ICMP Packet with unknown operation";
            break;
    }
    return explanation;
}
//# sourceMappingURL=explain.js.map