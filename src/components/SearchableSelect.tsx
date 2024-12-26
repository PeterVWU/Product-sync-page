// components/SearchableSelect.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';

interface Option {
    label: string;
    value: string;
}

interface SearchableSelectProps {
    options: Option[];
    value: string;
    onChange: (value: string, label: string, newOptions?: Option[]) => void;
    placeholder?: string;
    className?: string;
    attributeCode?: string;
    allowCreate?: boolean;
}
// Constants for virtualization
const ITEM_HEIGHT = 32; // Height of each option in pixels
const ITEM_LIMIT = 100; // Number of items to show initially and when searching
const LIST_HEIGHT = 300; // Max height of the dropdown


const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select a value",
    className = "",
    attributeCode,
    allowCreate = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [displayedOptions, setDisplayedOptions] = useState<Option[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Sort options alphabetically - memoized to prevent unnecessary sorting
    const sortedOptions = useMemo(() => {
        return [...options].sort((a, b) => a.label?.localeCompare(b.label));
    }, [options]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm("");
                setIsCreating(false);
                setCreateError(null);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when dropdown opens
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Update displayed options when search term changes
    useEffect(() => {
        if (searchTerm) {
            const filtered = sortedOptions
                .filter(option =>
                    option.label?.toLowerCase().includes(searchTerm?.toLowerCase()))
                .slice(0, ITEM_LIMIT);
            setDisplayedOptions(filtered);
        } else {
            // Show first ITEM_LIMIT items when no search
            setDisplayedOptions(sortedOptions.slice(0, ITEM_LIMIT));
        }
    }, [searchTerm, sortedOptions]);

    // Get selected option label
    const selectedLabel = sortedOptions.find(opt => opt.value === value)?.label || '';

    const handleCreateValue = async () => {
        if (!attributeCode || !searchTerm.trim()) return;

        setIsLoading(true);
        setCreateError(null);

        try {
            const response = await fetch('/create-attribute-value', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    attributeCode,
                    value: searchTerm.trim()
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create attribute value');
            }

            const newOption = {
                label: searchTerm.trim(),
                value: data.option.value
            };

            // Update the local options list
            const updatedOptions = [...options, newOption];

            // Call onChange with the new value
            onChange(newOption.value, newOption.label, updatedOptions);

            setIsOpen(false);
            setSearchTerm("");
            setIsCreating(false);

        } catch (error) {
            setCreateError((error as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOptionSelect = (selectedOption: Option) => {
        // setLocalValue(selectedOption.value);
        onChange(selectedOption.value, selectedOption.label);
        setIsOpen(false);
        setSearchTerm("");
    };

    // Virtualized row renderer
    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const option = displayedOptions[index];
        const isSelected = option.value === value;

        return (
            <div
                style={style}
                className={`
                    px-3 py-1 text-sm cursor-pointer hover:bg-gray-100
                    ${isSelected ? 'bg-blue-50 text-blue-600' : ''}
                `}
                onClick={() => handleOptionSelect(option)}
            >
                {option.label}
            </div>
        );
    };

    const showCreateOption = allowCreate && searchTerm.trim() &&
        !displayedOptions.some(opt =>
            opt.label.toLowerCase() === searchTerm.trim().toLowerCase()
        );

    return (
        <div className={`relative w-full ${className}`} ref={dropdownRef}>
            {/* Selected Value Display */}
            <div
                className="w-full h-9 px-3 py-2 bg-white border border-gray-300 rounded cursor-pointer flex items-center justify-between"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="truncate text-sm">
                    {value ? selectedLabel : <span className="text-gray-500">{placeholder}</span>}
                </div>
                <span className={`text-gray-500 text-sm ml-2 transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg">
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-300">
                        <input
                            ref={searchInputRef}
                            type="text"
                            className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Search or enter new value..."
                            value={searchTerm}
                            onChange={(e) => {
                                setSearchTerm(e.target.value);
                                setIsCreating(false);
                                setCreateError(null);
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div>
                        {displayedOptions.length === 0 && !showCreateOption && (
                            <div className="py-2 px-3 text-sm text-gray-500 text-center">
                                No matching options
                            </div>
                        )}

                        {displayedOptions.length > 0 && (
                            <List
                                height={Math.min(displayedOptions.length * ITEM_HEIGHT + (showCreateOption ? ITEM_HEIGHT : 0), LIST_HEIGHT)}
                                itemCount={displayedOptions.length}
                                itemSize={ITEM_HEIGHT}
                                width="100%"
                            >
                                {Row}
                            </List>
                        )}

                        {showCreateOption && !isCreating && (
                            <div className="border-t border-gray-200">
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="w-full px-3 py-2 text-sm text-left text-blue-600 hover:bg-blue-50"
                                >
                                    + Create "{searchTerm.trim()}"
                                </button>
                            </div>
                        )}

                        {isCreating && (
                            <div className="border-t border-gray-200 p-3 space-y-2">
                                <p className="text-sm text-gray-600">
                                    Create new value: "{searchTerm.trim()}"
                                </p>
                                {createError && (
                                    <p className="text-sm text-red-600">{createError}</p>
                                )}
                                <div className="flex space-x-2">
                                    <button
                                        onClick={handleCreateValue}
                                        disabled={isLoading}
                                        className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
                                    >
                                        {isLoading ? 'Creating...' : 'Confirm'}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setIsCreating(false);
                                            setCreateError(null);
                                        }}
                                        disabled={isLoading}
                                        className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}

                        {sortedOptions.length > ITEM_LIMIT && !searchTerm && (
                            <div className="py-2 px-3 text-xs text-gray-500 text-center border-t border-gray-200">
                                Showing first {ITEM_LIMIT} of {sortedOptions.length} items. Use search to find more.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;