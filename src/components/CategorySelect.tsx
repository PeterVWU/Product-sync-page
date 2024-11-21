import React, { useState, useEffect, useRef, useMemo } from 'react';

interface CategoryOption {
    label: string;
    value: string;
    level: number;
    parentId: number;
    path: string[];
    fullPath: string;
}

interface CategorySelectProps {
    options: CategoryOption[];
    value: string[];
    onChange: (value: string[]) => void;
    placeholder?: string;
}

const CategorySelect: React.FC<CategorySelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select Categories"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);


    // Sort categories while maintaining hierarchy
    const sortedCategories = useMemo(() => {
        // Group categories by level
        const categoriesByLevel: { [key: number]: CategoryOption[] } = {};
        options.forEach(cat => {
            if (!categoriesByLevel[cat.level]) {
                categoriesByLevel[cat.level] = [];
            }
            categoriesByLevel[cat.level].push(cat);
        });

        // Sort categories within each level
        Object.keys(categoriesByLevel).forEach(level => {
            categoriesByLevel[Number(level)].sort((a, b) =>
                a.label.localeCompare(b.label)
            );
        });

        // Flatten back to array while maintaining levels
        return options
            .slice()
            .sort((a, b) => {
                // First sort by level
                if (a.level !== b.level) {
                    return a.level - b.level;
                }
                // Then sort alphabetically within the same level
                return a.label.localeCompare(b.label);
            });
    }, [options]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm("");
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter categories based on search term
    const filteredCategories = useMemo(() => {
        if (!searchTerm) return sortedCategories;

        const searchLower = searchTerm.toLowerCase();
        return sortedCategories.filter(category =>
            category.label.toLowerCase().includes(searchLower)
        );
    }, [searchTerm, sortedCategories]);

    // Get selected categories' labels
    const selectedLabels = useMemo(() =>
        value.map(v => {
            const option = options.find(opt => opt.value === v);
            return option?.label || v;
        }),
        [value, options]
    );
    // Toggle option selection
    const toggleOption = (optionValue: string) => {
        const newValue = value.includes(optionValue)
            ? value.filter(v => v !== optionValue)
            : [...value, optionValue];
        onChange(newValue);
    };

    // const renderOption = (option: CategoryOption) => {
    //     const isSelected = value.includes(option.value);
    //     const indentLevel = Math.min(option.level - 1, 5); // Cap indentation at 5 levels
    //     const indentClass = `pl-${indentLevel * 4}`;

    //     return (
    //         <div
    //             key={option.value}
    //             className={`
    //                 flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-gray-100
    //                 ${indentClass}
    //                 ${isSelected ? 'bg-blue-50' : ''}
    //               `}
    //             onClick={(e) => {
    //                 e.stopPropagation();
    //                 toggleOption(option.value);
    //             }}
    //         >
    //             <input
    //                 type="checkbox"
    //                 checked={isSelected}
    //                 onChange={() => { }}
    //                 className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
    //             />
    //             <span className="truncate">{option.label}</span>
    //         </div>
    //     );
    // };

    return (
        <div className={`relative w-full`} ref={dropdownRef}>
            {/* Selected Categories Display */}
            <div
                className="min-h-9 px-3 py-2 bg-white border border-gray-300 rounded cursor-pointer flex items-center justify-between"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex-1 overflow-hidden">
                    {selectedLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {selectedLabels.map((label, index) => (
                                <span
                                    key={index}
                                    className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-600 text-sm rounded"
                                    title={label}
                                >
                                    {label}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <span className="text-gray-500 text-sm">{placeholder}</span>
                    )}
                </div>
                <span className={`ml-2 text-gray-500 text-sm transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg">
                    {/* Search Input */}
                    <div className="p-2 border-b border-gray-300 sticky top-0 bg-white">
                        <input
                            type="text"
                            className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                            placeholder="Search categories..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                        />
                    </div>

                    {/* Options List */}
                    <div className="max-h-60 overflow-y-auto">
                        {filteredCategories.length === 0 ? (
                            <div className="py-2 px-3 text-sm text-gray-500 text-center">
                                No matching categories found
                            </div>
                        ) : (
                            <div className="py-1">
                                {filteredCategories.map((category) => {
                                    const isSelected = value.includes(category.value);
                                    const indentLevel = Math.min(category.level - 1, 5);
                                    const paddingLeft = indentLevel * 16 + 12; // 12px base padding + 16px per level

                                    return (
                                        <div
                                            key={category.value}
                                            className={`
                            flex items-center py-1 text-sm cursor-pointer hover:bg-gray-100
                            ${isSelected ? 'bg-blue-50' : ''}
                          `}
                                            style={{ paddingLeft: `${paddingLeft}px` }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleOption(category.value);
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => { }}
                                                className="h-4 w-4 text-blue-600 border-gray-300 rounded mr-2"
                                            />
                                            <span className="truncate">{category.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CategorySelect;