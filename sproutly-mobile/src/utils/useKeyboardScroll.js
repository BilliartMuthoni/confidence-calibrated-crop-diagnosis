import { useEffect, useRef } from 'react';
import { Keyboard, TextInput } from 'react-native';

/**
 * For a form in a ScrollView: when the keyboard opens, scroll the box being typed in (a code,
 * a password, the symptoms) to just below the top, so the keyboard never covers it. Android
 * (edge to edge since Expo 57) no longer resizes the screen for the keyboard by itself, and
 * doesn't scroll to the focused box either. Use with <KeyboardAvoidingView behavior="padding">.
 *
 *     const scrollRef = useKeyboardScroll();
 *     <ScrollView ref={scrollRef}> ... </ScrollView>
 */
export default function useKeyboardScroll() {
    const scrollRef = useRef(null);

    useEffect(() => {
        const shown = Keyboard.addListener('keyboardDidShow', () => {
            const field = TextInput.State.currentlyFocusedInput();
            const content = scrollRef.current?.getInnerViewRef?.();
            if (!field || !content) return;
            field.measureLayout(
                content,
                (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 96), animated: true }),
                () => {} // not inside this scroll view: leave it
            );
        });
        return () => shown.remove();
    }, []);

    return scrollRef;
}
