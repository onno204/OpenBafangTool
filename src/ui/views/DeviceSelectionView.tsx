import React from 'react';
import { CheckboxChangeEvent } from 'antd/es/checkbox';
import {
    Button,
    Checkbox,
    Form,
    Select,
    Typography,
    Space,
    message,
} from 'antd';
import { SerialPort } from 'serialport';
import HID from 'node-hid';
import IConnection from '../../device/high-level/Connection';
import BafangUartMotor from '../../device/high-level/BafangUartMotor';
import BafangCanSystem from '../../device/high-level/BafangCanSystem';
import {
    CanConverterType,
    DeviceBrand,
    DeviceInterface,
    DeviceType,
} from '../../types/DeviceType';
import InterfaceType from '../../types/InterfaceType';
import filterPorts from '../../device/serial/serial-patcher';
import { listBesstDevices } from '../../device/besst/besst';
import { listCanableDevices } from '../../device/canable/canable';
import i18n from '../../i18n/i18n';

const { Option } = Select;

type DeviceSelectionProps = {
    deviceSelectionHook: (
        connection: IConnection,
        interfaceType: InterfaceType,
    ) => void;
};

type DeviceSelectionState = {
    portList: string[];
    besstDeviceList: HID.Device[];
    canableDeviceList: string[];
    connectionChecked: boolean;
    connection: IConnection | null;
    interfaceType: InterfaceType | null;
    deviceBrand: DeviceBrand | null;
    deviceInterface: DeviceInterface | null;
    deviceType: DeviceType | null;
    devicePort: string | null;
    canConveterType: CanConverterType | null;
    localLawsAgreement: boolean | null;
    disclaimerAgreement: boolean | null;
};

class DeviceSelectionView extends React.Component<
    DeviceSelectionProps,
    DeviceSelectionState
> {
    constructor(props: DeviceSelectionProps) {
        super(props);
        this.state = {
            portList: [],
            besstDeviceList: [],
            connectionChecked: false,
            connection: null,
            interfaceType: null,
            deviceBrand: DeviceBrand.Bafang,
            deviceInterface: null,
            deviceType: null,
            devicePort: null,
            canConveterType: null,
            canableDeviceList: [],
            localLawsAgreement: false,
            disclaimerAgreement: false,
        };

        setInterval(() => {
            SerialPort.list().then((ports) => {
                this.setState({
                    portList: filterPorts(
                        ports.map((port) => port.path),
                        true,
                    ),
                });
            });

            listCanableDevices()
                .then((canableDeviceList) =>
                    this.setState({ canableDeviceList }),
                )
                .catch(() => {
                    this.setState({ canableDeviceList: [] });
                    message.warning('Failed to list Canable devices');
                });

            this.setState({ besstDeviceList: listBesstDevices() });
        }, 1000);
    }

    render() {
        const { deviceSelectionHook } = this.props;
        const {
            portList,
            besstDeviceList,
            canableDeviceList,
            connectionChecked,
            connection,
            interfaceType,
            deviceBrand,
            deviceInterface,
            deviceType,
            devicePort,
            canConveterType,
        } = this.state;

        return (
            <div
                style={{
                    height: '100%',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                <Form
                    name="device-selection"
                    onFinish={() => {
                        deviceSelectionHook(
                            connection as IConnection,
                            interfaceType as InterfaceType,
                        );
                    }}
                >
                    <Typography.Title level={3}>
                        {i18n.t('select_device')}
                    </Typography.Title>
                    <Form.Item
                        name="device_interface"
                        label={i18n.t('device_protocol')}
                        rules={[
                            {
                                required: true,
                                message: i18n.t('protocol_required'),
                            },
                        ]}
                    >
                        <Select
                            onChange={(value: DeviceInterface) => {
                                if (value === DeviceInterface.CAN) {
                                    this.setState({
                                        deviceInterface: value,
                                        interfaceType: InterfaceType.Full,
                                        connectionChecked: false,
                                    });
                                }
                                this.setState({
                                    deviceInterface: value,
                                    deviceType: DeviceType.Motor,
                                    connectionChecked: false,
                                });
                            }}
                            allowClear
                            style={{ minWidth: '150px' }}
                        >
                            <Option value={DeviceInterface.UART}>UART</Option>
                            <Option value={DeviceInterface.CAN}>CAN</Option>
                        </Select>
                    </Form.Item>
                    {deviceInterface === DeviceInterface.UART && (
                        <Form.Item
                            name="interface_type"
                            label={i18n.t('interface_type')}
                            rules={[
                                {
                                    required: true,
                                    message: i18n.t('interface_type_required'),
                                },
                            ]}
                        >
                            <Select
                                onChange={(value: InterfaceType) => {
                                    this.setState({
                                        interfaceType: value,
                                        connectionChecked: false,
                                    });
                                }}
                                allowClear
                                style={{ minWidth: '150px' }}
                            >
                                <Option value={InterfaceType.Simplified}>
                                    {i18n.t('simplified_ui')}
                                </Option>
                                <Option value={InterfaceType.Full}>
                                    {i18n.t('full_featured_ui')}
                                </Option>
                            </Select>
                        </Form.Item>
                    )}
                    {deviceInterface === DeviceInterface.UART && (
                        <Form.Item
                            name="port"
                            label={i18n.t('serial_port')}
                            rules={[
                                {
                                    required: true,
                                    message: i18n.t('port_required'),
                                },
                            ]}
                        >
                            <Select
                                onChange={(value: string) => {
                                    this.setState({
                                        devicePort: value,
                                        connectionChecked: false,
                                    });
                                }}
                                allowClear
                                style={{ minWidth: '150px' }}
                            >
                                <Option value="demo">
                                    {i18n.t('demo_device')}
                                </Option>
                                {portList.map((item) => {
                                    return (
                                        <Option value={item} key={item}>
                                            {item}
                                        </Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>
                    )}
                    {deviceInterface === DeviceInterface.CAN && (
                        <Form.Item
                            name="usb_device"
                            label={i18n.t('usb_device')}
                            rules={[
                                {
                                    required: true,
                                    message: i18n.t('usb_required'),
                                },
                            ]}
                        >
                            <Select
                                onChange={(value: string) => {
                                    this.setState({
                                        devicePort: value,
                                        connectionChecked: false,
                                    });
                                }}
                                allowClear
                                style={{ minWidth: '150px' }}
                            >
                                <Option value="demo">
                                    {i18n.t('demo_device')}
                                </Option>
                                {besstDeviceList.map((item) => {
                                    return (
                                        <Option value={item} key={item}>
                                            {item}
                                        </Option>
                                    );
                                })}
                            </Select>
                        </Form.Item>
                    )}
                    {deviceInterface === DeviceInterface.CAN && (
                        <Form.Item
                            name="converter_type"
                            label="CAN converter type"
                            rules={[
                                {
                                    required: true,
                                    message: 'CAN converter is required',
                                },
                            ]}
                        >
                            <Select
                                onChange={(value: CanConverterType) => {
                                    this.setState({
                                        canConveterType: value,
                                        connectionChecked: false,
                                    });
                                }}
                                allowClear
                                style={{ minWidth: '150px' }}
                            >
                                {/* <Option value="demo">Demo</Option> */}
                                <Option value={CanConverterType.BESST}>
                                    BESST
                                </Option>
                                <Option value={CanConverterType.Canable}>
                                    Canable Pro 1.0
                                </Option>
                            </Select>
                        </Form.Item>
                    )}
                    {deviceInterface === DeviceInterface.CAN &&
                        canConveterType === CanConverterType.BESST && (
                            <Form.Item
                                name="usb_device"
                                label="USB device"
                                rules={[
                                    {
                                        required: true,
                                        message: 'USB device is required',
                                    },
                                ]}
                            >
                                <Select
                                    onChange={(value: string) => {
                                        this.setState({
                                            devicePort: value,
                                            connectionChecked: false,
                                        });
                                    }}
                                    allowClear
                                    style={{ minWidth: '150px' }}
                                >
                                    <Option value="demo">Demo</Option>
                                    {besstDeviceList.map((item) => {
                                        return (
                                            <Option
                                                value={item.path}
                                                key={item.path}
                                            >
                                                {item.product}
                                            </Option>
                                        );
                                    })}
                                </Select>
                            </Form.Item>
                        )}
                    {deviceInterface === DeviceInterface.CAN &&
                        canConveterType === CanConverterType.Canable && (
                            <Form.Item
                                name="usb_device"
                                label="USB device"
                                rules={[
                                    {
                                        required: true,
                                        message: 'USB device is required',
                                    },
                                ]}
                            >
                                <Select
                                    onChange={(value: string) => {
                                        this.setState({
                                            devicePort: value,
                                            connectionChecked: false,
                                        });
                                    }}
                                    allowClear
                                    style={{ minWidth: '150px' }}
                                >
                                    <Option value="demo">Demo</Option>
                                    {canableDeviceList.map((item) => {
                                        return (
                                            <Option value={item} key={item}>
                                                {item}
                                            </Option>
                                        );
                                    })}
                                </Select>
                            </Form.Item>
                        )}
                    <Form.Item
                        name="local_laws_agreement"
                        label=""
                        initialValue={false}
                        valuePropName="checked"
                        rules={[
                            {
                                validator: (_, value) =>
                                    value
                                        ? Promise.resolve()
                                        : Promise.reject(
                                              new Error(
                                                  i18n.t(
                                                      'law_disclaimer_error',
                                                  ),
                                              ),
                                          ),
                            },
                        ]}
                    >
                        <Checkbox
                            onChange={(value: CheckboxChangeEvent) => {
                                this.setState({
                                    localLawsAgreement: value.target.checked,
                                });
                            }}
                            checked={this.state.localLawsAgreement ?? false}
                            style={{ fontSize: '12px' }}
                        >
                            {i18n.t('law_disclaimer_text_1')}
                            <br />
                            {i18n.t('law_disclaimer_text_2')}
                            <span style={{ color: 'red' }}>&nbsp;*</span>
                        </Checkbox>
                    </Form.Item>
                    <Form.Item
                        name="disclaimer_agreement"
                        label=""
                        initialValue={false}
                        valuePropName="checked"
                        rules={[
                            {
                                validator: (_, value) =>
                                    value
                                        ? Promise.resolve()
                                        : Promise.reject(
                                              new Error(
                                                  i18n.t(
                                                      'responsibility_disclaimer_error',
                                                  ),
                                              ),
                                          ),
                            },
                        ]}
                    >
                        <Checkbox
                            onChange={(value: CheckboxChangeEvent) => {
                                this.setState({
                                    disclaimerAgreement: value.target.checked,
                                });
                            }}
                            checked={this.state.disclaimerAgreement ?? false}
                            style={{ fontSize: '12px' }}
                        >
                            {i18n.t('liability_disclaimer_text_1')}
                            <br />
                            {i18n.t('liability_disclaimer_text_2')}
                            <br />
                            {i18n.t('liability_disclaimer_text_3')}
                            <span style={{ color: 'red' }}>&nbsp;*</span>
                        </Checkbox>
                    </Form.Item>
                    <Form.Item>
                        <Space>
                            <Button
                                type="primary"
                                onClick={() => {
                                    let newConnection: IConnection;
                                    if (
                                        deviceBrand === DeviceBrand.Bafang &&
                                        deviceInterface ===
                                            DeviceInterface.UART &&
                                        deviceType === DeviceType.Motor &&
                                        devicePort !== null
                                    ) {
                                        newConnection = new BafangUartMotor(
                                            devicePort,
                                        );
                                    } else if (
                                        deviceBrand === DeviceBrand.Bafang &&
                                        deviceInterface ===
                                            DeviceInterface.CAN &&
                                        devicePort !== null
                                    ) {
                                        newConnection = new BafangCanSystem(
                                            devicePort,
                                            canConveterType ??
                                                CanConverterType.BESST,
                                        );
                                    } else {
                                        message.info(
                                            'This kind of device is not supported yet',
                                        );
                                        return;
                                    }
                                    newConnection
                                        .testConnection()
                                        .then((result) => {
                                            if (result) {
                                                this.setState({
                                                    connection: newConnection,
                                                });
                                            } else {
                                                message.error(
                                                    'Connection error!',
                                                );
                                            }
                                            this.setState({
                                                connectionChecked: result,
                                            });
                                            return null;
                                        })
                                        .catch(() => {
                                            this.setState({
                                                connectionChecked: false,
                                            });
                                            message.error('Connection error!');
                                        });
                                }}
                                disabled={
                                    deviceBrand === null ||
                                    devicePort === null ||
                                    deviceInterface === null ||
                                    (deviceBrand === DeviceBrand.Bafang &&
                                        deviceInterface ===
                                            DeviceInterface.UART &&
                                        deviceType === null) ||
                                    interfaceType === null
                                }
                            >
                                {i18n.t('check_connection')}
                            </Button>
                            <Button
                                type="primary"
                                htmlType="submit"
                                disabled={!connectionChecked}
                            >
                                {i18n.t('select')}
                            </Button>
                        </Space>
                    </Form.Item>
                </Form>
            </div>
        );
    }
}

export default DeviceSelectionView;
