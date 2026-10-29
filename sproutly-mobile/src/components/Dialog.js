import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../constants/theme';

// Sproutly's own pop-up, in place of the phone's plain grey Alert so every message matches the
// app. Same call as Alert.alert: showDialog(title, message, buttons), where each button is
// { text, style: 'cancel' | 'destructive' | undefined, onPress }. With no buttons it shows OK.
// <DialogHost /> is mounted once at the top of the app (App.js).

let show = null;
const waiting = [];

export function showDialog(title, message, buttons) {
    const dialog = { title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] };
    if (show) show(dialog);
    else waiting.push(dialog); // called before the host was mounted
}

function DialogButton({ button, onPress }) {
    const kind = button.style === 'destructive' ? 'danger' : button.style === 'cancel' ? 'plain' : 'main';
    const look = {
        main: { backgroundColor: COLORS.brand, color: '#FFFFFF' },
        danger: { backgroundColor: COLORS.danger, color: '#FFFFFF' },
        plain: { backgroundColor: 'transparent', color: COLORS.text, borderWidth: 1, borderColor: COLORS.divider },
    }[kind];
    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            className="items-center rounded-xl py-3.5 mt-2"
            style={{ backgroundColor: look.backgroundColor, borderWidth: look.borderWidth || 0, borderColor: look.borderColor }}
        >
            <Text className="text-base font-bold" style={{ color: look.color }}>
                {button.text}
            </Text>
        </TouchableOpacity>
    );
}

export default function DialogHost() {
    const [queue, setQueue] = useState([]);

    useEffect(() => {
        show = (dialog) => setQueue((current) => [...current, dialog]);
        if (waiting.length) setQueue((current) => [...current, ...waiting.splice(0)]);
        return () => {
            show = null;
        };
    }, []);

    const dialog = queue[0];
    // The main choice first, Cancel last, so the thumb finds the action in the same place.
    const buttons = dialog
        ? [...dialog.buttons].sort((a, b) => (a.style === 'cancel') - (b.style === 'cancel'))
        : [];
    const cancel = dialog?.buttons.find((b) => b.style === 'cancel');

    const press = (button) => {
        setQueue((current) => current.slice(1));
        button?.onPress?.();
    };

    return (
        <Modal visible={Boolean(dialog)} transparent animationType="fade" statusBarTranslucent
               onRequestClose={() => press(cancel || (dialog?.buttons.length === 1 ? dialog.buttons[0] : null))}>
            <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: 'rgba(11,26,19,0.45)' }}>
                {dialog && (
                    <View className="w-full rounded-2xl px-5 pt-5 pb-3" style={{ maxWidth: 360, backgroundColor: COLORS.surface }}
                          accessibilityViewIsModal>
                        <Text className="text-lg font-bold" style={{ color: COLORS.ink }} accessibilityRole="header">
                            {dialog.title}
                        </Text>
                        {dialog.message ? (
                            <Text className="text-base mt-1.5 leading-6" style={{ color: COLORS.text }}>
                                {dialog.message}
                            </Text>
                        ) : null}
                        <View className="mt-3">
                            {buttons.map((button) => (
                                <DialogButton key={button.text} button={button} onPress={() => press(button)} />
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
}
