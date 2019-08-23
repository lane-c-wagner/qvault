import uuidv4 from 'uuid/v4';
import Vue from 'vue';
import assert from '../lib/assert';

export default {
  data() {
    return {
      secrets: null,
    };
  },
  methods: {
    InitializeSecrets() {
      this.secrets = {};
    },

    CreateBox(name, type) {
      assert(this.secrets, 'No vault is open');
      assert(!(this.HasBox(name)), 'A box with that name already exists');
      let uuid = uuidv4();
      assert(!(uuid in this.secrets), 'A box with that uuid already exists');
      let box = {
        name,
        type,
        secrets: {},
        created: Date.now(),
      };
      Vue.set(this.secrets, uuid, box);
      return uuid;
    },

    GetBox(uuid) {
      assert(this.secrets, 'No vault is open');
      assert(uuid in this.secrets, `${uuid} is not a valid uuid`);
      return this.secrets[uuid];
    },

    HasBox(name) {
      return Boolean(
        Object.values(this.secrets).find(
          box => box.name == name
        )
      );
    },

    SetSecret(boxUUID, secret) {
      let box = this.GetBox(boxUUID);
      let uuid = uuidv4();
      Vue.set(box.secrets, uuid, secret);
      return uuid;
    },

    GetEmptySecret(box_type){
      let secret = {
        created: Date.now(),
        fields: {},
      };
      for (let field of box_type.fields) {
        let value = null;
        if (field.type === Array) {
          value = [];
        }
        Vue.set(secret.fields, field.name, value);
      }
      return secret;
    },

    DeleteSecret(boxUUID, secretUUID){
      let box = this.GetBox(boxUUID);
      Vue.delete(box.secrets, secretUUID);
    },

    DeleteBox(boxUUID){
      this.GetBox(boxUUID);
      Vue.delete(this.secrets, boxUUID);
    },

    LoadSecrets(new_secrets) {
      if (!this.secrets) {
        this.secrets = {};
      }
      for (const box_key of Object.keys(new_secrets)) {
        if (!(box_key in this.secrets)) {
          // Insert missing boxes
          Vue.set(this.secrets, box_key, new_secrets[box_key]);
          continue;
        }
        for (const secret_key of Object.keys(new_secrets[box_key].secrets)) {
          const new_secret = new_secrets[box_key].secrets[secret_key];
          let current_box_secrets = this.secrets[box_key].secrets;

          if (!(secret_key in current_box_secrets)) {
            // Insert missing secrets
            Vue.set(current_box_secrets, secret_key, new_secret);
          }
          else if (JSON.stringify(current_box_secrets[secret_key]) === JSON.stringify(new_secret)) {
            // Ignore identical secrets
          }
          else {
            // Assign conflicts
            Vue.set(current_box_secrets[secret_key], 'conflict', new_secret);
          }
        }
      }
    },

    BoxHasConflict(boxUUID){
      let box = this.GetBox(boxUUID);
      for(let secretUUID of Object.keys(box.secrets)){
        let secret = box.secrets[secretUUID];
        if(secret.conflict){
          return true;
        }
      }
      return false;
    },
  },
  computed: {
    ConflictExists(){
      if(this.secrets){
        for(const box_key of Object.keys(this.secrets)){
          const box = this.secrets[box_key];
          for (const secret_key of Object.keys(box.secrets)){
            const secret = box.secrets[secret_key];
            if(secret.conflict){
              return true;
            }
          }
        }
        return false;
      }
    },
  }
};
