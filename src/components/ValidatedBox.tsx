import React from 'react';

interface ValidatedBoxProps {
    children: React.ReactNode;
    validationState: 'valid' | 'warning' | 'error';
}

const ValidatedBox = ({ children, validationState }: ValidatedBoxProps) => {
    const borderClasses = {
        valid: '',
        warning: 'border-2 border-yellow-300 bg-yellow-50',
        error: 'border-2 border-red-300 bg-red-50'
    }[validationState];

    return (
        <div className={`rounded p-2 ${borderClasses}`}>
            {children}
        </div>
    );
};

export default ValidatedBox;