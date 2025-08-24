import { ArpPacket, ArpOP } from "../protocols/arp.js";
import { EtherType } from "../frame.js";
import { IcmpControlMessage, IcmpDatagram, IcmpUnreachableCode } from "../protocols/icmp.js";
import { InternetProtocolNumbers, Ipv4Packet } from "../protocols/ip.js";
import { Protocol } from "./variables.js";
import { UdpDatagram, UdpPorts } from "../protocols/udp.js";
import { DhcpMessageType, DhcpOP, DhcpOptions, DhcpPayload } from "../protocols/dhcp.js";
export function getExplanation(frame) {
    const ethertype = frame.ethertype;
    let type = "";
    let from = "";
    let to = "";
    let description = "";
    let protocols = [];
    let extra_fields_name = [];
    let extra_fields_val = [];
    if (ethertype <= EtherType.IEEE802dot3_Upper) {
    }
    else if (ethertype == EtherType.ARP) {
        protocols = [Protocol.ARP];
        const packet = ArpPacket.parsePacket(frame.packet);
        from = packet.src_pa.toString();
        to = packet.dest_pa.toString();
        switch (packet.op) {
            case ArpOP.REQUEST:
                type = 'Request';
                description = `Requesting the MAC address of the interface which has IP address ${to}`;
                break;
            case ArpOP.REPLY:
                type = 'Reply';
                description = `IP address ${from} has MAC address ${packet.src_ha}`;
                break;
            default:
                description = "ARP Packet with unknown operation";
                break;
        }
    }
    else if (ethertype == EtherType.IPv4) {
        protocols = [Protocol.IPv4];
        const packet = Ipv4Packet.parsePacket(frame.packet);
        extra_fields_name.push("TTL");
        extra_fields_val.push(packet.ttl.toString());
        from = packet.src.toString();
        to = packet.dest.toString();
        switch (packet.protocol) {
            case InternetProtocolNumbers.ICMP:
                protocols = [Protocol.ICMP];
                [type, description] = getICMPExplanation(packet);
                break;
            case InternetProtocolNumbers.UDP:
                protocols = [Protocol.UDP];
                let src_port, dest_port;
                [src_port, dest_port, type, description] = getUDPExplanation(packet, protocols);
                from += ':' + src_port;
                to += ':' + dest_port;
                // TODO: ADD INFO FOR UDP
                break;
        }
    }
    let extra_info = "";
    for (let i = 0; i < extra_fields_name.length; i++) {
        extra_info += `<div class="packet-field-${extra_fields_name[i].toLowerCase().replace(/\s/g, '-')}">${extra_fields_val[i]}</div>\n`;
    }
    let explanation = `
    <div class="packet-type packet-type-${type.toLowerCase().replace(/\s/g, '-')}">${type}</div>
    <div class="packet-params">
        <div class="packet-from">${from}</div>
        <div class="packet-to">${to}</div>
        ${extra_fields_name.length > 0 ? `<div class="packet-extra-info">${extra_info}</div>` : ''}
    </div>
    <div class="packet-description">${description}</div>
    `;
    return [protocols, explanation];
}
function getICMPExplanation(packet) {
    const icmp_datagram = IcmpDatagram.parse(packet.data);
    let type_str = "";
    let explanation = "";
    const type = icmp_datagram.type;
    const code = icmp_datagram.code;
    switch (type) {
        case IcmpControlMessage.ECHO_REQUEST:
            type_str = "Echo Request";
            explanation = `Device ${packet.src} is attempting to reach ${packet.dest}`;
            break;
        case IcmpControlMessage.ECHO_REPLY:
            type_str = "Echo Reply";
            explanation = `Device ${packet.src} is responding to ${packet.dest}'s request`;
            break;
        case IcmpControlMessage.TIME_EXCEEDED:
            type_str = "Time Exceeded";
            explanation = `Request expired in transit`;
            break;
        case IcmpControlMessage.UNREACHABLE:
            switch (code) {
                case IcmpUnreachableCode.HOST:
                    type_str = "Host Unreachable";
                    explanation = `Request could not be forwarded because ${packet.src} could not find the destination host`;
                    break;
                case IcmpUnreachableCode.NET:
                    type_str = "Network Unreachable";
                    explanation = `Request could not be forwarded because ${packet.src} could not find a route to the destination network`;
                    break;
                default:
                    type_str = "Unreachable";
                    break;
            }
            break;
        default:
            explanation = "ICMP Packet with unknown operation";
            break;
    }
    return [type_str, explanation];
}
function getUDPExplanation(packet, protocols) {
    const datagram = packet.data;
    const src_port = UdpDatagram.getSrcPort(datagram);
    const dest_port = UdpDatagram.getDestPort(datagram);
    let type_str = "";
    let explanation = "";
    switch (dest_port) {
        case UdpPorts.DhcpServer:
        // should DhcpServer and DhcpClient have different conditions for packet parsing?
        // probably not, right?
        // Dhcp Payload formats are the same for both?
        // just have to check if it's a discover / offer / request / acknowledge ?
        case UdpPorts.DhcpClient:
            protocols.push(Protocol.DHCP);
            [type_str, explanation] = getDHCPExplanation(datagram);
            break;
        default:
            break;
    }
    return [
        src_port,
        dest_port,
        type_str,
        explanation
    ];
}
function getDHCPExplanation(udp_datagram) {
    const dhcp_payload = DhcpPayload.parse(UdpDatagram.getDataBytes(udp_datagram));
    const chaddr = Array.from(dhcp_payload.chaddr.slice(0, 6)).map((x) => x.toString(16)).join(':');
    const server_ipv4 = dhcp_payload.siaddr;
    const your_ipv4 = dhcp_payload.yiaddr;
    let type_str = '';
    let explanation = '';
    const message_type_val = dhcp_payload.options.get(DhcpOptions.MESSAGE_TYPE);
    if (message_type_val) {
        const message_type = message_type_val[1][0];
        if (dhcp_payload.op == DhcpOP.BOOTREQUEST) {
            switch (message_type) {
                case DhcpMessageType.DHCPDISCOVER:
                    type_str = 'Discover';
                    explanation = `Device ${chaddr} is searching for a DHCP server on the local network`;
                    break;
                case DhcpMessageType.DHCPREQUEST:
                    type_str = 'Request';
                    explanation = `Device ${chaddr} is requesting an IP address from DHCP server ${server_ipv4}`;
                    break;
            }
        }
        else if (dhcp_payload.op == DhcpOP.BOOTREPLY) {
            switch (message_type) {
                case DhcpMessageType.DHCPOFFER:
                    type_str = 'Offer';
                    explanation = `DHCP server ${server_ipv4} advertises itself to device ${chaddr}`;
                    break;
                case DhcpMessageType.DHCPACK:
                    type_str = 'Acknowledge';
                    explanation = `DHCP server ${server_ipv4} leases the IP address ${your_ipv4} to device ${chaddr}`;
                    break;
            }
        }
    }
    return [type_str, explanation];
}
//# sourceMappingURL=explain.js.map