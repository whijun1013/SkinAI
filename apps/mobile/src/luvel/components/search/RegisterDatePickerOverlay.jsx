import React, { useMemo } from 'react';
import RegisterDatePickerSheet from './RegisterDatePickerSheet';
import { getTodayString, parseDateString } from './searchDateUtils';

/** @deprecated RegisterDatePickerSheet 사용 권장 */
export default function RegisterDatePickerOverlay({
  visible,
  value,
  onChange,
  onClose,
  maximumDate = new Date(),
}) {
  const pickerDate = useMemo(
    () => parseDateString(value) || parseDateString(getTodayString()) || new Date(),
    [value]
  );

  return (
    <RegisterDatePickerSheet
      visible={visible}
      value={pickerDate}
      maximumDate={maximumDate}
      onConfirm={onChange}
      onDismiss={onClose}
    />
  );
}
