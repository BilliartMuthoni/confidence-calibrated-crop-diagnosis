// Phone numbers are stored as +254712345678 (backend app/core/phone.py), so 0712... and +254...
// find the same account. On screen they are shown the way farmers write them: 0712 345 678.

/** "+254712345678" -> "0712 345 678"; anything else is shown as it is. */
export function showPhone(phone) {
    if (!phone) return '';
    const m = /^\+254(\d{3})(\d{3})(\d{3})$/.exec(phone);
    return m ? `0${m[1]} ${m[2]} ${m[3]}` : phone;
}
