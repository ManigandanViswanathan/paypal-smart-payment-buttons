
// TODO: need to shim in a promise library for squid etc.

import { $promise } from 'squid-core/dist/promise';
import { $util } from 'squid-core/dist/util';

import { getAuth, getPayment, executePayment, getLocale } from './api';
import { renderButton } from './button';

let { Promise, config, Checkout } = window.paypal;

$promise.use(Promise);

function isLightboxEligible() {

    return getAuth().then(auth => {

        if (!$util.cookiesEnabled()) {
            return false;
        }

        if (auth.logged_in || auth.remembered || auth.refresh_token) {
            return true;
        }
    });
}

function determineLocale() {

    return Promise.try(() => {

        let userLocale = window.xprops.locale;

        if (userLocale) {
            let [ lang, country ] = userLocale.split('_');

            if (!config.locales[country]) {
                throw new Error(`Invalid country: ${country} for locale ${userLocale}`);
            }

            if (config.locales[country].indexOf(lang) === -1) {
                throw new Error(`Invalid language: ${lang} for locale ${userLocale}`);
            }

            return { lang, country };
        }

        return getLocale();
    });
}

function getActions(checkout, data, actions) {

    return {

        ...actions,

        payment: {

            execute: () => {

                if (!data.paymentID) {
                    throw new Error('Client side execute is only available for REST based transactions');
                }

                if (!data.payment || !data.payment.intent === 'sale') {
                    throw new Error('Client side execute is only available for SALE transactions');
                }

                checkout.closeComponent();

                return executePayment(data.paymentToken, data.payerID);
            },

            executeAndConfirm: () => {
                throw new Error('Not implemented');
            }
        },

        restart: () => {
            return checkout.close().then(() => {
                return renderCheckout(data.paymentToken);
            });
        }
    };
}


function renderCheckout(paymentToken) {

    Checkout.init({

        payment: paymentToken || window.xprops.payment,
        billingAgreement: window.xprops.billingAgreement,

        locale: window.xprops.locale,
        commit: window.xprops.commit,

        onAuthorize(data, actions) {

            return Promise.try(() => {

                if (data.paymentID) {
                    return getPayment(data.paymentID).then(payment => {
                        data.payment = payment;
                    });
                }

            }).then(() => {

                return window.xprops.onAuthorize(data, getActions(this, data, actions));
            });
        },

        onCancel(data, actions) {

            return window.xprops.onCancel(data, actions);
        }

    }).renderTo(window.top);
}

export default function setup() {

    isLightboxEligible().then(eligible => {
        Checkout.contexts.lightbox = eligible;
    });

    determineLocale().then(locale => {
        config.locale.country = locale.country;
        config.locale.lang = locale.lang;
    });

    renderButton(event => {
        event.preventDefault();

        renderCheckout();

        if (window.xprops.onClick) {
            window.xprops.onClick();
        }
    });
}
