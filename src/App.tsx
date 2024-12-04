// App.tsx
import { useEffect, useState } from 'react'
import './App.css'
import { MagentoAttributeMetadata, ShopifyProduct, CategoryOption } from '../functions/backendTypes'
import { AttributeMappingType, VariantMapping } from "./frontendTypes";
import ProductSearch from "./components/ProductSearch";
import MultiVariantMapping from "./components/MultiVariantMapping";

function App() {
  const [attributes, setAttributes] = useState<MagentoAttributeMetadata[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [variantMappings, setVariantMappings] = useState<VariantMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);
  const [shopifyImporting, setShopifyImporting] = useState(false);
  const [shopifyImportProgress, setShopifyImportProgress] = useState<{
    current: number;
    total: number;
    status: string;
  } | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/get-magento-attributes')
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          return data.attributes;
        }),
      fetch('/get-magento-categories')
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          return data.categories;
        })
    ])
      .then(([attributesData, categoriesData]) => {
        setAttributes(attributesData);
        setCategories(categoriesData);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handleAttributesUpdate = (updatedAttributes: MagentoAttributeMetadata[]) => {
    setAttributes(updatedAttributes);
  };
  const handleImportAll = (product: ShopifyProduct) => {
    setSelectedProduct(product);
    // Initialize mappings for all variants
    const initialMappings = product.variants.map(variant => ({
      variant,
      mappings: {} // Will be populated when AttributeMapping component mounts
    }));
    setVariantMappings(initialMappings);
    setImportStatus(null);
  };

  const handleSaveMapping = async (configurableSku: string, isNewConfigurable: boolean, existingVariantSkus: string[]) => {
    if (!selectedProduct) return;

    try {
      setImporting(true);
      setImportStatus('Importing...');

      // Get only the variants that need to be imported
      const filteredMappings = variantMappings.filter(mapping =>
        !existingVariantSkus.includes(mapping.variant.sku)
      );

      if (filteredMappings.length === 0) {
        throw new Error('No new variants to import');
      }

      setImportProgress({
        current: 0,
        total: filteredMappings.length,
        status: 'Starting import...'
      });

      if (isNewConfigurable) {
        // Get configurable attributes only from variants that will be imported
        const configurableAttributes = new Map<string, Set<string>>();
        filteredMappings.forEach(mapping => {
          Object.entries(mapping.mappings).forEach(([, attr]) => {
            if (attr?.mappedTo &&
              attr.mappedValue &&
              !['manufacturer', 'brand', 'description', 'name', 'url_key', 'price', 'status', 'visibility', 'category_ids', 'tax_class_id', 'meta_keyword', 'meta_title', 'meta_description'].includes(attr.mappedTo)) {
              let valueSet = configurableAttributes.get(attr.mappedTo);
              if (!valueSet) {
                valueSet = new Set<string>();
                configurableAttributes.set(attr.mappedTo, valueSet);
              }
              valueSet.add(attr.mappedValue as string);
            }
          });
        });

        const attributesPayload = Array.from(configurableAttributes.entries()).map(([attrCode, values]) => {
          const attribute = attributes.find(a => a.attribute_code === attrCode);
          if (!attribute) {
            throw new Error(`Attribute ${attrCode} not found`);
          }

          return {
            code: attrCode,
            label: attribute.default_frontend_label,
            valueIds: Array.from(values),
            options: attribute.options || []
          };
        });

        if (attributesPayload.length === 0) {
          throw new Error('No configurable attributes found');
        }
        console.log('filteredMappings', filteredMappings)
        const response = await fetch('/create-configurable-product', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shopifyProduct: selectedProduct,
            configurableSku,
            attributes: attributesPayload,
            productAttributes: {
              description: filteredMappings[0].mappings.description?.mappedValue,
              manufacturer: filteredMappings[0].mappings.manufacturer?.mappedValue,
              brand: filteredMappings[0].mappings.brand?.mappedValue,
              category_ids: filteredMappings[0].mappings.category_ids?.mappedValue,
              meta_title: filteredMappings[0].mappings.meta_title?.mappedValue,
              meta_keyword: filteredMappings[0].mappings.meta_keyword?.mappedValue,
              meta_description: filteredMappings[0].mappings.meta_description?.mappedValue,
            }
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to create configurable product');
        }
      }

      // Import variants sequentially
      for (let i = 0; i < filteredMappings.length; i++) {
        const { variant, mappings } = filteredMappings[i];
        const currentStatus = `Importing variant ${i + 1} of ${filteredMappings.length}: ${variant.title}`;
        setImportProgress({ current: i, total: filteredMappings.length, status: currentStatus });
        setImportStatus(currentStatus);

        const response = await fetch('/import-to-magento', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shopifyProduct: selectedProduct,
            variant,
            attributeMappings: mappings,
            configurableSku,
            isNewConfigurable: false
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(`Failed to import variant ${variant.title}: ${data.error}`);
        }

        // Update progress after successful import
        setImportProgress({
          current: i + 1,
          total: filteredMappings.length,
          status: `Successfully imported variant ${i + 1} of ${filteredMappings.length}`
        });

        // Add a small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      setImportProgress({
        current: filteredMappings.length,
        total: filteredMappings.length,
        status: 'Import completed successfully!'
      });
      setImportStatus('Import successful!');

      // Clear states after short delay to show completion
      setTimeout(() => {
        setSelectedProduct(null);
        setVariantMappings([]);
        setImportProgress(null);
      }, 1500);
    } catch (err) {
      const errorMessage = `Import failed: ${(err as Error).message}`;
      setImportStatus(errorMessage);
      setImportProgress(prev => prev ? { ...prev, status: errorMessage } : null);
    } finally {
      setImporting(false);
    }
  };

  const handleUpdateVariantMapping = (index: number, mappings: AttributeMappingType) => {
    setVariantMappings(prevMappings => {
      const newMappings = [...prevMappings];
      // Update the specific variant's mappings
      newMappings[index] = {
        ...newMappings[index],
        mappings: { ...newMappings[index].mappings, ...mappings }
      };
      return newMappings;
    });
  };

  const handleCancel = () => {
    setSelectedProduct(null);
    setVariantMappings([]);
    setImportStatus(null);
  };

  const handleShopifyImport = async (product: ShopifyProduct, selectedStores: string[]) => {
    if (selectedStores.length === 0) {
      setImportStatus('Please select at least one target store');
      return;
    }

    try {
      setShopifyImporting(true);
      setImportStatus('Importing to selected Shopify stores...');

      setShopifyImportProgress({
        current: 0,
        total: selectedStores.length,
        status: 'Starting import to Shopify stores...'
      });

      const response = await fetch('/import-to-shopify-batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shopifyProduct: product,
          targetStoreIds: selectedStores
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      const { summary, results } = result;

      setShopifyImportProgress({
        current: summary.successful,
        total: summary.total,
        status: `Import complete: ${summary.successful} successful, ${summary.failed} failed`
      });

      setImportStatus(
        results.map((r: any) =>
          `${r.storeName}: ${r.success ? 'Success' : `Failed - ${r.error}`}`
        ).join('\n')
      );

      if (summary.successful > 0) {
        setTimeout(() => {
          setShopifyImportProgress(null);
          setSelectedProduct(null);
          setVariantMappings([]);
        }, 3000);
      }
    } catch (err) {
      setImportStatus(`Import failed: ${(err as Error).message}`);
    } finally {
      setShopifyImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold mb-8 text-center">Shopify to Magento Product Sync</h1>

        {importStatus && (
          <div className={`mb-6 p-4 rounded-lg ${importStatus.includes('failed')
            ? 'bg-red-50 text-red-600 border border-red-200'
            : 'bg-green-50 text-green-600 border border-green-200'
            }`}>
            {importStatus}
          </div>
        )}
        {selectedProduct ? (
          <MultiVariantMapping
            product={selectedProduct}
            variantMappings={variantMappings}
            attributes={attributes}
            categories={categories}
            onUpdateMapping={handleUpdateVariantMapping}
            onSave={handleSaveMapping}
            onAttributesUpdate={handleAttributesUpdate}
            onCancel={handleCancel}
            importing={importing}
            importProgress={importProgress}
            shopifyImporting={shopifyImporting}
            shopifyImportProgress={shopifyImportProgress}
            onShopifyImport={handleShopifyImport}
          />

        ) : (
          <ProductSearch
            onImportAll={handleImportAll}
          />
        )}
      </div>
    </div>
  )
}

export default App
