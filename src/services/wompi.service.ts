import axios, { AxiosResponse } from 'axios';
import crypto from 'crypto';
import {
  WOMPI_CONFIG,
  getWompiUrl,
  getPrivateKey,
  getPublicKey
} from '../config/wompi';
import { generateCardTokenizationSignature, generateNequiTokenizationSignature, generateDaviplataTokenizationSignature, generateTransactionSignature } from '../utils/generateWompiSignature';

// Types
export interface WompiAcceptanceTokens {
  data: {
    presigned_acceptance: {
      acceptance_token: string;
      permalink: string;
      type: string;
    };
    presigned_personal_data_auth: {
      acceptance_token: string;
      permalink: string;
      type: string;
    };
  };
}

export interface WompiTokenResponse {
  data: {
    id: string;
    status: string;
    created_at: string;
    expires_at: string;
    payment_method: {
      type: string;
      [key: string]: any;
    };
  };
}

export interface WompiPaymentSourceResponse {
  data: {
    id: string;
    type: string;
    status: string;
    customer_email: string;
    created_at: string;
  };
}

export interface WompiTransactionResponse {
  data: {
    id: string;
    status: string;
    amount_in_cents: number;
    currency: string;
    reference: string;
    customer_email: string;
    payment_method: {
      type: string;
      [key: string]: any;
    };
    payment_link_id?: string;
    redirect_url?: string;
    async_payment_url?: string;
    created_at: string;
    finalized_at?: string;
  };
}

export interface CardTokenizationData {
  number: string;
  exp_month: string;
  exp_year: string;
  cvc: string;
  card_holder: string;
}

export interface NequiTokenizationData { phone_number: string; }
export interface DaviplataTokenizationData { phone_number: string; }
export interface BancolombiaTransferTokenizationData { phone_number: string; }

export interface PSETransactionData {
  amount_in_cents: number;
  currency: string;
  reference: string;
  customer_email: string;
  acceptance_token: string;
  accept_personal_auth: string;
  payment_method: {
    type: 'PSE';
    user_type: 'PERSONAL' | 'BUSINESS';
    user_legal_id_type: 'CC' | 'CE' | 'NIT';
    user_legal_id: string;
    financial_institution_code: string;
    payment_description: string;
  };
}

class WompiService {
  private privateKey = getPrivateKey();
  private publicKey = getPublicKey();

  private generateSignature(method: string, endpoint: string, timestamp: number, data?: any): string {
    const payload = `${method.toUpperCase()}\n${endpoint}\n${timestamp}\n${data ? JSON.stringify(data) : ''}`;
    return crypto.createHmac('sha256', this.privateKey).update(payload).digest('hex');
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: any
  ): Promise<T> {
    const url = getWompiUrl(endpoint);

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.privateKey}`,
    };



    try {
      const response = await axios({
        method,
        url,
        headers,
        data,
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Wompi Request Error:');
      console.error('Error response:', error.response?.data);
      console.error('Status:', error.response?.status);
      throw new Error(`Wompi Error: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async getAcceptanceTokens(): Promise<WompiAcceptanceTokens> {
    const endpoint = `${WOMPI_CONFIG.ENDPOINTS.MERCHANT}/${this.publicKey}`;
    return this.makeRequest<WompiAcceptanceTokens>('GET', endpoint);
  }

  async tokenizeCard(data: CardTokenizationData): Promise<WompiTokenResponse> {
    // For card tokenization, use public key authentication
    const url = getWompiUrl(WOMPI_CONFIG.ENDPOINTS.TOKENS.CARDS);
    
    // Generate integrity signature
    const signature = generateCardTokenizationSignature(data);
    
    // Add signature to the request body
    const requestBody = {
      ...data,
      signature
    };
    
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.publicKey}`,
    };

    // Debug: Log the request details
    console.log('🔍 Wompi Card Tokenization Debug:');
    console.log('URL:', url);
    console.log('Using PUBLIC KEY for authentication');
    console.log('Public Key (first 10 chars):', this.publicKey.substring(0, 10) + '...');
    console.log('Signature generated:', signature.substring(0, 10) + '...');

    try {
      const response = await axios({
        method: 'POST',
        url,
        headers,
        data: requestBody,
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Wompi Card Tokenization Error:');
      console.error('Error response:', error.response?.data);
      console.error('Status:', error.response?.status);
      throw new Error(`Wompi Error: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async tokenizeNequi(data: NequiTokenizationData): Promise<WompiTokenResponse> {
    // Generate integrity signature
    const signature = generateNequiTokenizationSignature(data);
    
    // Add signature to the request body
    const requestBody = {
      ...data,
      signature
    };
    
    return this.makeRequest('POST', WOMPI_CONFIG.ENDPOINTS.TOKENS.NEQUI, requestBody);
  }

  async tokenizeDaviplata(data: DaviplataTokenizationData): Promise<WompiTokenResponse> {
    // Generate integrity signature
    const signature = generateDaviplataTokenizationSignature(data);
    
    // Add signature to the request body
    const requestBody = {
      ...data,
      signature
    };
    
    return this.makeRequest('POST', WOMPI_CONFIG.ENDPOINTS.TOKENS.DAVIPLATA, requestBody);
  }

  async tokenizeBancolombiaTransfer(data: BancolombiaTransferTokenizationData): Promise<WompiTokenResponse> {
    return this.makeRequest('POST', WOMPI_CONFIG.ENDPOINTS.TOKENS.BANCOLOMBIA_TRANSFER, data);
  }

  async checkTokenStatus(type: 'nequi' | 'daviplata' | 'bancolombia_transfer', tokenId: string): Promise<WompiTokenResponse> {
    const endpoint = `${WOMPI_CONFIG.ENDPOINTS.TOKENS[type.toUpperCase() as keyof typeof WOMPI_CONFIG.ENDPOINTS.TOKENS]}/${tokenId}`;
    return this.makeRequest('GET', endpoint);
  }

  async sendOtp(url: string, bearerToken: string): Promise<void> {
    await axios.post(url, {}, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async validateOtp(url: string, bearerToken: string, code: string): Promise<void> {
    await axios.post(url, { code }, {
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createPaymentSource(payload: {
    type: string;
    token: string;
    customer_email: string;
    acceptance_token: string;
    accept_personal_auth: string;
  }): Promise<WompiPaymentSourceResponse> {
    return this.makeRequest('POST', WOMPI_CONFIG.ENDPOINTS.PAYMENT_SOURCES, payload);
  }

async createTransaction(payload: {
  amount_in_cents: number;
  currency: string;
  reference: string;
  customer_email: string;
  acceptance_token: string;
  accept_personal_auth: string;
  payment_method: {
    type: string;
    [key: string]: any;
  };
  payment_source_id?: string;
  installments?: number;
  signature: string; // ✅ signature is expected to already be included
}): Promise<WompiTransactionResponse> {
  // ✅ No signature generation here — just forward the payload
  return this.makeRequest('POST', WOMPI_CONFIG.ENDPOINTS.TRANSACTIONS, payload);
}


  async pollTokenStatus(
    type: 'nequi' | 'daviplata' | 'bancolombia_transfer',
    tokenId: string,
    maxWaitTime = WOMPI_CONFIG.TIMEOUTS.TOKEN_MAX_WAIT
  ): Promise<WompiTokenResponse> {
    const start = Date.now();
    while (Date.now() - start < maxWaitTime) {
      const res = await this.checkTokenStatus(type, tokenId);
      if (res.data.status === WOMPI_CONFIG.TOKEN_STATUSES.APPROVED) return res;
      if (res.data.status === WOMPI_CONFIG.TOKEN_STATUSES.DECLINED) throw new Error(`Token ${type} declined`);
      await new Promise(r => setTimeout(r, WOMPI_CONFIG.TIMEOUTS.TOKEN_POLL_INTERVAL));
    }
    throw new Error(`Token ${type} polling timeout`);
  }

  async getTransactionStatus(transactionId: string): Promise<WompiTransactionResponse> {
    const endpoint = `${WOMPI_CONFIG.ENDPOINTS.TRANSACTIONS}/${transactionId}`;
    return this.makeRequest('GET', endpoint);
  }

  async pollTransactionStatus(
    transactionId: string,
    maxWaitTime = WOMPI_CONFIG.TIMEOUTS.TRANSACTION_MAX_WAIT
  ): Promise<WompiTransactionResponse> {
    const start = Date.now();
    while (Date.now() - start < maxWaitTime) {
      const res = await this.getTransactionStatus(transactionId);
      const status = res.data.status;
      if (status === WOMPI_CONFIG.STATUSES.APPROVED) return res;
      if (status === WOMPI_CONFIG.STATUSES.DECLINED || status === WOMPI_CONFIG.STATUSES.ERROR) {
        throw new Error(`Transaction ${transactionId} failed: ${status}`);
      }
      await new Promise(r => setTimeout(r, WOMPI_CONFIG.TIMEOUTS.TRANSACTION_POLL_INTERVAL));
    }
    throw new Error(`Transaction ${transactionId} polling timeout`);
  }
}

let _wompiService: WompiService | null = null;
export const wompiService = (): WompiService => {
  if (!_wompiService) _wompiService = new WompiService();
  return _wompiService;
};