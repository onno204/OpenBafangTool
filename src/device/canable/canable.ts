import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
import { AutoDetectTypes } from '@serialport/bindings-cpp';
import IGenericCanAdapter from '../can/generic';
import { ParsedCanFrame } from '../../types/BafangCanCommonTypes';
import { PromiseControls } from '../../types/common';
import {
    CanableCommands,
    CanableWritePacket,
    getCanableCommandInterval,
    getCanableCommandTimeout,
} from './canable-types';
import { CanFrame } from '../can/can-types';
import { CanablePort } from './canable-port';
import { CanableFrame } from './canable-frame';
import { log } from 'console';
import { parseCanFrame } from '../high-level/bafang-can-utils';
import { CanIncommingFrameHandler } from '../can/CanIncommingFrameHandler';

export async function listCanableDevices(): Promise<string[]> {
    return (await SerialPort.list())
        .filter(
            (port) =>
                port.vendorId === 'AD50' &&
                ['60C5', '60C4'].includes(port.productId ?? ''), // Should this only be productId 60C4?
        )
        .map((port) => port.path);
}

class CanableDevice implements IGenericCanAdapter {
    private path: string;

    private device?: SerialPort<AutoDetectTypes>;

    private CanablePort?: CanablePort;

    public readonly emitter: EventEmitter;

    private serialReadBuffer: number[] = [];

    private versionPromise?: PromiseControls;

    private canIncommingFrameHandler = new CanIncommingFrameHandler(
        this.sendCanFrame.bind(this),
    );

    private packetQueue: CanableWritePacket[] = [];

    private lastMultiframeCanResponse: {
        [key: number]: ParsedCanFrame;
    } = [];

    constructor(path: string) {
        this.path = path;
        this.processWriteQueue = this.processWriteQueue.bind(this);
        // this.processCanFrame = this.processCanFrame.bind(this);
        this.connect = this.connect.bind(this);
        this.sendCanFrame = this.sendCanFrame.bind(this);
        this.sendCanFrameImmediately = this.sendCanFrameImmediately.bind(this);
        this.getVersion = this.getVersion.bind(this);
        this.disconnect = this.disconnect.bind(this);
        this.emitter = new EventEmitter();
    }

    private processWriteQueue(): void {
        if (this.packetQueue.length === 0) {
            setTimeout(this.processWriteQueue, 100);
            return;
        }
        const packet = this.packetQueue.shift() as CanableWritePacket;
        // const bytes: number[] = [packet.type];
        // if (packet.type === CanableCommands.VERSION) {
        //     setTimeout(() => {
        //         this.versionPromise?.reject();
        //         this.versionPromise = undefined;
        //     }, getCanableCommandTimeout(packet.type));
        // } else if (packet.type === CanableCommands.FRAME && packet.frame) {
        //     bytes.push((packet.frame.data.length & 0xf) + 0x30);
        //     packet.frame.id.forEach((value) => {
        //         bytes.push(((value & 0xf0) >> 4) + 0x30);
        //         bytes.push((value & 0xf) + 0x30);
        //     });
        //     packet.frame.data.forEach((value) => {
        //         bytes.push(((value & 0xf0) >> 4) + 0x30);
        //         bytes.push((value & 0xf) + 0x30);
        //     });
        // }
        // bytes.push(0x0a);
        packet.promise?.resolve();
        try {
            // log.info('sent besst package:', packet.data);
            if (packet.frame) {
                this.sendCanFrameToCanablePort(packet.frame);
            } else {
                console.error(
                    'Failed attempting to write(no frame data):',
                    // bytes,
                    packet,
                );
            }
            // this.device?.write(bytes);
            // this.CanablePort?.send({
            //     id: 1,
            //     extendedId: true,
            //     dlc: 8,
            //     data: [1, 2, 3, 4, 5, 6, 7, 8],
            // });
        } catch (e) {
            console.error('write error:', e);
            // this.onDisconnect();
        }
        setTimeout(
            this.processWriteQueue,
            getCanableCommandInterval(packet.type) + 10,
        );
    }

    public async connect(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // To prevent multiple connections to the same COM port, we check if there is already a port connected in this class
            if (this.CanablePort) {
                console.log(
                    'There is already a port connected, ignoring connect request',
                );
                resolve();
                return;
            }
            this.CanablePort = new CanablePort(this.path);
            this.CanablePort.open((error) => (error ? reject(error) : 0));
            this.CanablePort.setBitRate(250000);
            this.CanablePort.on('data', this.processFrame.bind(this));

            this.CanablePort.on('open', () => {
                this.packetQueue.push({
                    type: CanableCommands.OPEN,
                });
                resolve();
            });

            this.CanablePort.on('disconnect', () => {
                this.CanablePort = undefined;
                this.emitter.emit('disconnect');
            });

            setTimeout(this.processWriteQueue, 100);
        });
    }

    private sendCanFrameToCanablePort(frame: CanFrame): void {
        // Convert the CanFrame to a CanableFrame
        const canableFrame: CanableFrame = new CanableFrame(
            frame.id.reduce(
                (acc, byte, index) => acc + byte * 256 ** (3 - index),
                0,
            ),
            frame.data.length,
            frame.id.length === 4,
            frame.data,
        );
        this.CanablePort?.send(canableFrame);
    }

    private logNextFrame: boolean = false;

    private processFrame(frame: CanableFrame): void {
        // The CAN-id is converted to hex and needs to be split into 4 groups.
        // Say the hex is "abbccdd", we split it into ["a", "bb", "cc", "dd"]. Then we convert each part to a number.
        const hexFirstChar = frame.getHexId()[0];
        const hexRemaining = frame.getHexId().slice(1);
        const frameId = [hexFirstChar, ...hexRemaining.match(/.{2}/g)].map(
            (byte) => parseInt(byte, 16),
        );

        const incommingCanFrame: CanFrame = {
            id: frameId,
            data: frame.data,
        };

        this.canIncommingFrameHandler
            .processCanFrame(incommingCanFrame)
            .then((canFrame: CanFrame | null) => {
                if (!canFrame) return canFrame; // If the frame is null, it was a multiframe and it is waiting for more frames
                // Emit the frame to the listeners
                this.emitter.emit('can', canFrame);
                return canFrame;
            })
            .catch((error) => {
                console.error('[canable]Error processing frame:', error);
            });
    }

    public getVersion(): Promise<number[]> {
        return new Promise<number[]>((resolve, reject) => {
            this.packetQueue.push({
                type: CanableCommands.VERSION,
            });
            this.versionPromise = { resolve, reject };
        });
    }

    public testConnection(): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            // if (!this.CanablePort) await this.connect();
            // this.getVersion()
            //     .then((version) => {
            //         console.log(version);
            //         resolve(true);
            //     })
            //     .catch(reject);
            resolve(true);
        });
    }

    public sendCanFrame(frame: CanFrame): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.packetQueue.push({
                type: CanableCommands.FRAME,
                frame,
                promise: { resolve, reject },
            });
        });
    }

    public sendCanFrameImmediately(frame: CanFrame): Promise<void> {
        return new Promise<void>((resolve, reject) => {});
    }

    public disconnect(): void {
        this.device?.close();
        this.CanablePort?.close();
    }
}

export default CanableDevice;
