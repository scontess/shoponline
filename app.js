// --- CONFIGURATION ---
const SUPABASE_URL = 'https://jjtchtdqeyigqthckwrk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LHu-ACylxwJ58UhGyuFpOA_GCBcw4Ri';

// Initialize Supabase Client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener('alpine:init', () => {
  Alpine.data('storeApp', () => ({
    // State
    view: 'shop', // 'shop', 'cart', 'checkout', 'success'
    products: [],
    categories: [],
    selectedCategory: 'All',
    searchQuery: '',
    cart: [],
    email: '',
    loading: false,
    errorMessage: '',
    orderSuccessData: null,

    // Initialize Store
    async init() {
      await this.fetchProducts();
      this.loadCartFromStorage();
      
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('success') === 'true') {
        this.view = 'success';
        this.orderSuccessData = {
          sessionId: urlParams.get('session_id')
        };
        this.cart = [];
        localStorage.removeItem('cart');
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    },

    // Fetch Products from Supabase using exact schema columns
   /* async fetchProducts() {
      this.loading = true;
      this.errorMessage = '';
      try {
        const { data, error } = await supabaseClient
          .from('products')
          .select('id, name, short_description, unit_price, image_url, category, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        this.products = data || [];
        
        const cats = new Set(this.products.map(p => p.category).filter(Boolean));
        this.categories = ['All', ...Array.from(cats)];
      } catch (err) {
        console.error('Error fetching products:', err);
        this.errorMessage = 'Could not load products. Please check configuration.';
        this.products = [];
      } finally {
        this.loading = false;
      }
    },*/

    // Fetch Products from Supabase using exact schema columns + is_visible filter
    async fetchProducts() {
      this.loading = true;
      this.errorMessage = '';
      try {
        const { data, error } = await supabaseClient
          .from('products')
          .select('id, name, short_description, unit_price, image_url, category, is_visible, created_at')
          .eq('is_visible', true) // <-- MOSTRA SOLO I PRODOTTI VISIBILI
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        this.products = data || [];
        
        const cats = new Set(this.products.map(p => p.category).filter(Boolean));
        this.categories = ['All', ...Array.from(cats)];
      } catch (err) {
        console.error('Error fetching products:', err);
        this.errorMessage = 'Could not load products. Please check configuration.';
        this.products = [];
      } finally {
        this.loading = false;
      }
    },

    // Filtered Products Getter mapped to exact columns
    get filteredProducts() {
      if (!Array.isArray(this.products)) return [];

      const query = (this.searchQuery || '').toLowerCase();

      return this.products.filter(p => {
        const category = p.category || 'All';
        const matchesCategory = this.selectedCategory === 'All' || category === this.selectedCategory;
        
        const name = (p.name || '').toLowerCase();
        const desc = (p.short_description || '').toLowerCase();
        
        const matchesSearch = name.includes(query) || desc.includes(query);
        
        return matchesCategory && matchesSearch;
      });
    },

    // Cart Management
    loadCartFromStorage() {
      const saved = localStorage.getItem('cart');
      if (saved) {
        try { this.cart = JSON.parse(saved); } catch(e) { this.cart = []; }
      }
    },

    saveCartToStorage() {
      localStorage.setItem('cart', JSON.stringify(this.cart));
    },

    addToCart(product) {
      const existing = this.cart.find(item => item.id === product.id);
      const stock = product.stock !== undefined ? product.stock : 99;
      
      const productPrice = parseFloat(product.unit_price) || 0;
      const productName = product.name || 'Prodotto';
      const productImage = product.image_url || '';
      
      if (existing) {
        if (existing.quantity < stock) {
          existing.quantity++;
        } else {
          alert('Maximum stock reached for this item.');
        }
      } else {
        this.cart.push({ 
          id: product.id,
          name: productName,
          price: productPrice,
          image_url: productImage,
          quantity: 1,
          stock: stock
        });
      }
      this.saveCartToStorage();
    },

    removeFromCart(productId) {
      this.cart = this.cart.filter(item => item.id !== productId);
      this.saveCartToStorage();
    },

    updateQuantity(productId, delta) {
      const item = this.cart.find(i => i.id === productId);
      if (item) {
        item.quantity += delta;
        if (item.quantity <= 0) {
          this.removeFromCart(productId);
        } else {
          this.saveCartToStorage();
        }
      }
    },

    get cartCount() {
      if (!Array.isArray(this.cart)) return 0;
      return this.cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
    },

    get cartSubtotal() {
      if (!Array.isArray(this.cart)) return 0;
      return this.cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
    },

    // Helper per formattare e leggere il prezzo nel template HTML (es: x-text="`$${product.unit_price}`")
    formatPrice(price) {
      const p = parseFloat(price);
      return isNaN(p) ? '0.00' : p.toFixed(2);
    },

    // Checkout Handling via Supabase Edge Function & Stripe
    async handleCheckout() {
      if (!this.email || !this.email.includes('@')) {
        alert('Please enter a valid email address.');
        return;
      }
      if (this.cart.length === 0) {
        alert('Your cart is empty.');
        return;
      }

      this.loading = true;
      this.errorMessage = '';

      try {
        const { data, error } = await supabaseClient.functions.invoke('create-checkout-session', {
          body: {
            items: this.cart,
            email: this.email,
            successUrl: window.location.origin + window.location.pathname + '?success=true&session_id={CHECKOUT_SESSION_ID}',
            cancelUrl: window.location.origin + window.location.pathname + '?canceled=true'
          }
        });

        if (error) throw error;

        if (data && data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('No checkout URL returned from payment server.');
        }

      } catch (err) {
        console.error('Checkout error:', err);
        this.errorMessage = 'Failed to initiate checkout session. Please try again.';
        this.loading = false;
      }
    }
  }));
});