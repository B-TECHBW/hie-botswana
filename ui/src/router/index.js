import Vue from "vue";
import VueRouter from "vue-router";
import Home from "../views/Home.vue";
import Client from "../views/Client.vue";
import AddUser from "../views/AddUser.vue";
import Login from '@/views/Login.vue'
import Logout from '@/components/Logout.vue'
import VueCookies from 'vue-cookies'
import {
  store
} from '../store/store.js'

Vue.use(VueRouter);

const routes = [{
    path: "/",
    name: "home",
    component: Home
  },
  {
    path: "/client/:clientId",
    name: "client",
    component: Client
  },
  {
    path: '/addUser',
    name: 'AddUser',
    component: AddUser
  },
  {
    path: '/login',
    name: 'Login',
    component: Login
  },
  {
    path: '/logout',
    name: 'Logout',
    component: Logout
  }
];

const router = new VueRouter({
  routes
});

router.beforeEach((to, from, next) => {
  if (!store.state.auth.token &&
    (!VueCookies.get('token') || VueCookies.get('token') === 'null' || !VueCookies.get('userID') || VueCookies.get('userID') === 'null')
  ) {
    if (to.path !== '/Login') {
      next({
        path: '/Login'
      })
    } else {
      return next()
    }
  } else {
    next()
  }
})

export default router;