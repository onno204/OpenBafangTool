export enum CanOperation {
    WRITE_CMD = 0x00,
    READ_CMD = 0x01,
    NORMAL_ACK = 0x02, // Single frame response to requested data (OK)
    ERROR_ACK = 0x03, // Single frame response to requested data (ERROR)
    MULTIFRAME_START = 0x04, // Start of a multi-frame response // The frame data is how many bytes the multi-frame response should be (MULTIFRAME.data + MULTIFRAME_END.data)
    MULTIFRAME = 0x05, // Middle of a multi-frame response
    MULTIFRAME_END = 0x06, // End of a multi-frame response
    MULTIFRAME_WARNING = 0x07,
}

export enum DeviceNetworkId {
    TORQUE_SENSOR = 0x01,
    DRIVE_UNIT = 0x02,
    DISPLAY = 0x03,
    BATTERY = 0x04,
    BESST = 0x05,
    BROADCAST = 0x1f,
}

/*
Example data:
canCommandCode: 49
canCommandSubCode: 3
canOperationCode: 0
data: (8) [22, 3, 235, 2, 175, 2, 126, 2]
sourceDeviceCode: 1
targetDeviceCode: 31
*/
export type ParsedCanFrame = {
    canCommandCode: number;
    canCommandSubCode: number;
    canOperationCode: CanOperation;
    sourceDeviceCode: DeviceNetworkId;
    targetDeviceCode: DeviceNetworkId;
    data: number[];
};
